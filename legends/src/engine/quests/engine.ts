/**
 * Quest engine (GDD §F, quest-catalog). Pure and idempotent:
 *  - Boards are drawn deterministically from hash(playerId, periodId, rulesetVersion, slot)
 *    and FROZEN in the ledger the first time they are generated (no rerolling by rerunning).
 *  - A quest completes once per period (`quest|<id>|<period>`), with its BP in a separate
 *    `bp.quest|…` entry. Quests never award EXP (STK-5).
 *  - A period closes 48 h after it ends (and only when all sources were complete); then
 *    close-time quests are evaluated, incomplete quests are marked expired, and the period
 *    is finalised. Finalised periods are never evaluated again.
 * Evaluation is driven by the run time, not by new commits: every scheduled run catches up
 * on all periods since Season 1 that are not finalised yet.
 */
import { sha256Hex } from "../../core/hash.ts";
import type { ExpContext } from "../exp.ts";
import type { Facts } from "../facts.ts";
import type { SpecializationResult } from "../heroes/index.ts";
import type { LedgerEntry } from "../ledger.ts";
import { levelForExp } from "../level.ts";
import type { SeasonState } from "../progression.ts";
import { addDays, dayOf, dayStart, isoWeek, seasonByNumber, seasonOf } from "../time.ts";
import {
  CONTRACTS_PER_SEASON,
  DAILY_BOARD_SLOTS,
  DEDICATION,
  type PeriodWindow,
  type Progress,
  QUESTS,
  type QuestDef,
  type QuestPool,
  questById,
  WEEKLY_BOARD_SLOTS,
  WEEKLY_MIN_LEVEL,
} from "./catalog.ts";

export interface QuestRunInput {
  ctx: ExpContext;
  facts: Facts;
  spec: SpecializationResult;
  seasons: readonly SeasonState[];
  closureAllowed: boolean;
  playerId: number;
}

export interface QuestView {
  id: string;
  name: string;
  description: string;
  reward: { bp: number; cosmetic?: string };
  status: "active" | "completed" | "expired";
  progress: Progress;
  verification: string;
}

export interface BoardView {
  pool: QuestPool;
  period: PeriodWindow;
  /** Instant (UTC) after which the period closes and incomplete quests expire. */
  closesAt: string;
  quests: QuestView[];
}

export interface QuestBoardsView {
  today: BoardView | null;
  week: BoardView | null;
  dedication: { daysWithAllDailies: number; target: number; completed: boolean } | null;
  contracts: BoardView | null;
  asOf: string;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function mondayOf(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/** Deterministic pick: hash(playerId | periodId | rulesetVersion | slot) mod pool size (pool sorted by id). */
export function seededPick<T extends { id: string }>(
  pool: readonly T[],
  playerId: number,
  periodId: string,
  rulesVersion: string,
  slot: string,
): T | undefined {
  if (pool.length === 0) return undefined;
  const sorted = [...pool].sort((a, b) => cmp(a.id, b.id));
  const n = Number.parseInt(
    sha256Hex(`${playerId}|${periodId}|${rulesVersion}|${slot}`).slice(0, 12),
    16,
  );
  return sorted[n % sorted.length];
}

function closesAtMs(endDay: string, input: QuestRunInput): number {
  return (
    dayStart(addDays(endDay, 1), input.ctx.config.timezone) +
    input.ctx.rules.time.closureGraceHours * 3_600_000
  );
}

export function runQuests(input: QuestRunInput): QuestBoardsView {
  const { ctx } = input;
  const s1 = ctx.config.season1Start;
  const today = dayOf(ctx.runMs, ctx.config.timezone);
  if (today < s1)
    return { today: null, week: null, dedication: null, contracts: null, asOf: ctx.runAt };

  // Daily periods since Season 1.
  for (let day = s1; day <= today; day = addDays(day, 1)) {
    if (ctx.ledger.has(`quest.closed|daily|${day}`)) continue;
    processPeriod(input, "daily", { id: day, start: day, end: day }, () => dailyBoard(input, day));
  }
  // Weekly periods (clipped to Season 1).
  for (let monday = mondayOf(s1); monday <= today; monday = addDays(monday, 7)) {
    const window = {
      id: isoWeek(monday),
      start: monday < s1 ? s1 : monday,
      end: addDays(monday, 6),
    };
    // Dedication first: the weekly closure below would otherwise hide it from a catch-up run.
    awardDedication(input, window);
    if (!ctx.ledger.has(`quest.closed|weekly|${window.id}`))
      processPeriod(input, "weekly", window, () => weeklyBoard(input, window));
    if (!ctx.ledger.has(`quest.closed|specialty|${window.id}`))
      processPeriod(input, "specialty", window, () => specialtyBoard(input, window));
  }
  // Season contracts.
  const current = seasonOf(today, s1);
  for (let n = 1; n <= (current?.number ?? 0); n++) {
    const season = seasonByNumber(n, s1);
    if (ctx.ledger.has(`quest.closed|contract|${season.id}`)) continue;
    const window = { id: season.id, start: season.startDay, end: season.endDay };
    processPeriod(
      input,
      "contract",
      window,
      () => contractBoard(input, window),
      input.seasons.find((s) => s.season.id === season.id),
    );
  }
  return views(input, today);
}

function processPeriod(
  input: QuestRunInput,
  pool: QuestPool,
  window: PeriodWindow,
  generate: () => string[],
  season?: SeasonState,
): void {
  const { ctx } = input;
  const boardId = `quest.board|${pool}|${window.id}`;
  if (!ctx.ledger.has(boardId)) {
    ctx.ledger.add({
      id: boardId,
      kind: "quest",
      rule: "quest.board",
      ruleVersion: ctx.rules.version,
      subject: [`board:${pool}:${window.id}`],
      amount: 0,
      effectiveDay: window.start,
      createdAt: ctx.runAt,
      meta: { pool, period: window.id, quests: generate().join(",") },
    });
  }
  const quests = boardQuests(input, pool, window.id);
  const closing = ctx.runMs >= closesAtMs(window.end, input) && input.closureAllowed;
  const today = dayOf(ctx.runMs, ctx.config.timezone);
  for (const quest of quests) {
    if (ctx.ledger.has(`quest|${quest.id}|${window.id}`)) continue;
    if (quest.evaluateAtClose && !closing) continue;
    const progress = quest.progress({
      facts: input.facts,
      spec: input.spec,
      window,
      ledger: ctx.ledger,
      ...(season ? { season } : {}),
    });
    if (
      progress.completedOn !== null &&
      progress.completedOn >= window.start &&
      progress.completedOn <= window.end &&
      progress.completedOn <= today
    ) {
      complete(
        input,
        quest.id,
        pool,
        window.id,
        progress.completedOn,
        progress.evidence,
        quest.reward,
      );
    }
  }
  if (!closing) return;
  for (const quest of quests) {
    if (ctx.ledger.has(`quest|${quest.id}|${window.id}`)) continue;
    ctx.ledger.add({
      id: `quest.expired|${quest.id}|${window.id}`,
      kind: "quest",
      rule: "quest.expired",
      ruleVersion: ctx.rules.version,
      subject: [`quest:${quest.id}:${window.id}`],
      amount: 0,
      reason: "expired",
      effectiveDay: window.end,
      createdAt: ctx.runAt,
      meta: { pool, period: window.id },
    });
  }
  ctx.ledger.add({
    id: `quest.closed|${pool}|${window.id}`,
    kind: "quest",
    rule: "quest.period_closed",
    ruleVersion: ctx.rules.version,
    subject: [`board:${pool}:${window.id}`],
    amount: 0,
    effectiveDay: window.end,
    createdAt: ctx.runAt,
    meta: { pool, period: window.id },
  });
}

export function complete(
  input: QuestRunInput,
  questId: string,
  pool: QuestPool | "bonus",
  period: string,
  day: string,
  evidence: readonly string[],
  reward: { bp: number; cosmetic?: string },
): void {
  const { ctx } = input;
  const id = `quest|${questId}|${period}`;
  if (ctx.ledger.has(id)) return;
  const season = seasonOf(day, ctx.config.season1Start);
  const base: Pick<LedgerEntry, "effectiveDay" | "week" | "createdAt" | "ruleVersion"> = {
    effectiveDay: day,
    week: isoWeek(day),
    createdAt: ctx.runAt,
    ruleVersion: ctx.rules.version,
  };
  ctx.ledger.add({
    id,
    kind: "quest",
    rule: "quest.complete",
    subject: [`quest:${questId}:${period}`],
    amount: 0,
    ...base,
    ...(season ? { season: season.id } : {}),
    meta: { pool, period, quest: questId, evidence: evidence.slice(0, 5).join(",") },
  });
  ctx.ledger.add({
    id: `bp.quest|${questId}|${period}`,
    kind: "bp",
    rule: "bp.quest",
    subject: [`quest:${questId}:${period}`],
    amount: reward.bp,
    ...base,
    ...(season ? { season: season.id } : {}),
    meta: { quest: questId, period, ...(reward.cosmetic ? { cosmetic: reward.cosmetic } : {}) },
  });
}

function boardQuests(input: QuestRunInput, pool: QuestPool, period: string): QuestDef[] {
  const ids = String(input.ctx.ledger.get(`quest.board|${pool}|${period}`)?.meta?.quests ?? "");
  return ids
    .split(",")
    .filter(Boolean)
    .map((id) => questById(id))
    .filter((q): q is QuestDef => q !== undefined);
}

function eligiblePool(input: QuestRunInput, pool: QuestPool, before: string): QuestDef[] {
  const ectx = { facts: input.facts, spec: input.spec, before, ledger: input.ctx.ledger };
  return QUESTS.filter((q) => q.pool === pool && q.available && q.eligible(ectx));
}

/** Daily board (quest-catalog §1): slot 1 core, slot 2 variety (fallback D03), slot 3 any eligible. */
function dailyBoard(input: QuestRunInput, day: string): string[] {
  const { playerId, ctx } = input;
  const eligible = eligiblePool(input, "daily", day);
  const chosen: QuestDef[] = [];
  const take = (pool: QuestDef[], slot: number) => {
    const pick = seededPick(
      pool.filter((q) => !chosen.includes(q)),
      playerId,
      day,
      ctx.rules.version,
      String(slot),
    );
    if (pick) chosen.push(pick);
    return pick;
  };
  take(
    eligible.filter((q) => q.slots?.includes(1)),
    1,
  );
  const variety = take(
    eligible.filter((q) => q.slots?.includes(2)),
    2,
  );
  if (!variety) {
    const fallback = questById("D03");
    if (fallback && !chosen.includes(fallback)) chosen.push(fallback);
  }
  take(eligible, 3);
  return chosen.slice(0, DAILY_BOARD_SLOTS).map((q) => q.id);
}

/** Weekly board: 3 eligible weekly quests (incl. collaborative), from level 3 at the week's start. */
function weeklyBoard(input: QuestRunInput, window: PeriodWindow): string[] {
  const level = levelForExp(input.facts.expBefore(window.start), input.ctx.rules);
  if (level < WEEKLY_MIN_LEVEL) return [];
  const eligible = eligiblePool(input, "weekly", window.start);
  const chosen: QuestDef[] = [];
  for (let slot = 1; slot <= WEEKLY_BOARD_SLOTS; slot++) {
    const pick = seededPick(
      eligible.filter((q) => !chosen.includes(q)),
      input.playerId,
      window.id,
      input.ctx.rules.version,
      String(slot),
    );
    if (pick) chosen.push(pick);
  }
  return chosen.map((q) => q.id);
}

/** +1 specialty quest from the emblem active at the start of the week (GDD §D.4). */
function specialtyBoard(input: QuestRunInput, window: PeriodWindow): string[] {
  const activations = input.ctx.ledger.entries
    .filter((e) => e.rule === "emblem.activate" && (e.effectiveDay ?? "") <= window.start)
    .sort((a, b) => cmp(a.effectiveDay ?? "", b.effectiveDay ?? ""));
  const emblem = activations.at(-1)?.meta?.emblem;
  const quest = QUESTS.find((q) => q.pool === "specialty" && q.emblem === emblem && q.available);
  return quest ? [quest.id] : [];
}

/** Two season contracts, drawn once per season. */
function contractBoard(input: QuestRunInput, window: PeriodWindow): string[] {
  const pool = QUESTS.filter((q) => q.pool === "contract" && q.available);
  const chosen: QuestDef[] = [];
  for (let slot = 1; slot <= CONTRACTS_PER_SEASON; slot++) {
    const pick = seededPick(
      pool.filter((q) => !chosen.includes(q)),
      input.playerId,
      window.id,
      input.ctx.rules.version,
      String(slot),
    );
    if (pick) chosen.push(pick);
  }
  return chosen.map((q) => q.id);
}

/** Dedication: all daily quests completed on ≥ 5 days of the week → +50 BP once. */
function awardDedication(input: QuestRunInput, window: PeriodWindow): void {
  const { ctx } = input;
  if (
    ctx.ledger.has(`quest|${DEDICATION.id}|${window.id}`) ||
    ctx.ledger.has(`quest.closed|weekly|${window.id}`)
  )
    return;
  const full = fullDailyDays(input, window);
  if (full.length >= DEDICATION.fullDays) {
    const day = full[DEDICATION.fullDays - 1] as string;
    complete(
      input,
      DEDICATION.id,
      "bonus",
      window.id,
      day,
      full.map((d) => `day:${d}`),
      { bp: DEDICATION.bp },
    );
  }
}

function fullDailyDays(input: QuestRunInput, window: PeriodWindow): string[] {
  const days: string[] = [];
  for (let day = window.start; day <= window.end; day = addDays(day, 1)) {
    const board = boardQuests(input, "daily", day);
    if (
      board.length === DEDICATION.dailies &&
      board.every((q) => input.ctx.ledger.has(`quest|${q.id}|${day}`))
    )
      days.push(day);
  }
  return days;
}

function views(input: QuestRunInput, today: string): QuestBoardsView {
  const { ctx } = input;
  const view = (pool: QuestPool, window: PeriodWindow, season?: SeasonState): BoardView => ({
    pool,
    period: window,
    closesAt: new Date(closesAtMs(window.end, input)).toISOString().replace(".000Z", "Z"),
    quests: boardQuests(input, pool, window.id).map((q) => {
      const completed = ctx.ledger.has(`quest|${q.id}|${window.id}`);
      const expired = ctx.ledger.has(`quest.expired|${q.id}|${window.id}`);
      const progress = q.progress({
        facts: input.facts,
        spec: input.spec,
        window,
        ledger: ctx.ledger,
        ...(season ? { season } : {}),
      });
      return {
        id: q.id,
        name: q.name,
        description: q.description,
        reward: q.reward,
        verification: q.verification,
        status: completed ? "completed" : expired ? "expired" : "active",
        progress: { ...progress, current: Math.min(progress.current, progress.target) },
      };
    }),
  });
  const monday = mondayOf(today);
  const week = {
    id: isoWeek(monday),
    start: monday < ctx.config.season1Start ? ctx.config.season1Start : monday,
    end: addDays(monday, 6),
  };
  const weekBoard = view("weekly", week);
  const specialty = view("specialty", week);
  weekBoard.quests.push(...specialty.quests);
  const season = seasonOf(today, ctx.config.season1Start);
  return {
    today: view("daily", { id: today, start: today, end: today }),
    week: weekBoard,
    dedication: {
      daysWithAllDailies: fullDailyDays(input, week).length,
      target: DEDICATION.fullDays,
      completed: ctx.ledger.has(`quest|${DEDICATION.id}|${week.id}`),
    },
    contracts: season
      ? view(
          "contract",
          { id: season.id, start: season.startDay, end: season.endDay },
          input.seasons.find((s) => s.season.id === season.id),
        )
      : null,
    asOf: ctx.runAt,
  };
}
