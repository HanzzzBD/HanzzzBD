import type { AnyEvent } from "../normalize/event.ts";
import { allocateCommitExp, allocateOtherExp, allocatePrivateExp, type ExpContext } from "./exp.ts";
import { evaluateSpecialization, type SpecializationResult } from "./heroes/index.ts";
import { type LedgerEntry, LedgerIndex } from "./ledger.ts";
import { type LevelProgress, levelProgress } from "./level.ts";
import {
  awardActivityAndBattleBp,
  awardBattles,
  awardLevelBp,
  flagUnavailableSources,
  progressSeasons,
  recordObjectives,
  type SeasonState,
} from "./progression.ts";
import {
  type AutomationFlag,
  Diagnostics,
  type EngineConfig,
  prepareEvents,
  qualifyCommits,
} from "./qualify.ts";
import { type RankPosition, rankFromStars, type TrialProgress, tierEntries } from "./rank.ts";
import { RULESET_V1, type Ruleset, type TierRule } from "./rules.ts";
import { assertSeason1Start, dayOf, daysBetween, isoWeek, parseInstant } from "./time.ts";

export interface EngineInput {
  rules?: Ruleset;
  config: EngineConfig;
  /** Normalized events from the store (any revisions; the latest rev per key is used). */
  events: readonly AnyEvent[];
  /** Existing ledger (append-only). */
  ledger: readonly LedgerEntry[];
  /** The run's single clock reading (UTC ISO-8601). */
  runAt: string;
  /** True only when every source a period depends on was collected completely (closure guard). */
  closureAllowed: boolean;
  /** Event keys the store knows were deleted or became inaccessible. */
  unavailableKeys?: readonly string[];
}

export interface RankProgress {
  seasonId: string;
  startDay: string;
  endDay: string;
  daysLeft: number;
  startStars: number;
  /** Stars earned (start + battles), before trial gating. */
  rawStars: number;
  /** Stars that count for rank after trial gating. */
  stars: number;
  bankedStars: number;
  rank: RankPosition;
  /** Next division or tier and the stars needed to reach it (null at Eternal). */
  next: { label: string; starsNeeded: number } | null;
  /** Trial for the next gated tier above the current rank, if any. */
  trial: {
    tier: string;
    met: boolean;
    required: TierRule["trial"];
    progress: TrialProgress;
  } | null;
  blockedBy: string | null;
  weekStars: number;
  weeklyStarCap: number;
}

export interface Progress {
  lifetime: LevelProgress & { bp: number };
  season: RankProgress | null;
}

export interface EngineOutput {
  rulesVersion: string;
  newEntries: LedgerEntry[];
  ledger: LedgerEntry[];
  diagnostics: Array<{ code: string; count: number; examples: string[] }>;
  automationFlags: AutomationFlag[];
  seasons: SeasonState[];
  progress: Progress;
  /** Heroes, mastery, emblems and equipment. */
  specialization: SpecializationResult;
}

/**
 * Deterministic game engine (architecture §9). Pure: the same input produces the same
 * output, and re-running with the returned ledger adds nothing (idempotency).
 */
export function runEngine(input: EngineInput): EngineOutput {
  const rules = input.rules ?? RULESET_V1;
  const runMs = parseInstant(input.runAt);
  if (runMs === null) throw new Error("runAt must be an ISO-8601 instant");
  assertSeason1Start(input.config.season1Start);
  dayOf(runMs, input.config.timezone); // throws RangeError on an invalid timezone

  const existing = [...input.ledger];
  const ledger = new LedgerIndex(existing);
  const diagnostics = new Diagnostics();
  const ctx: ExpContext = {
    rules,
    config: input.config,
    ledger,
    diagnostics,
    runAt: input.runAt,
    runMs,
  };

  const prepared = prepareEvents(input.events, diagnostics, runMs);
  const events = [...prepared.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  // 1. Qualification and EXP (lifetime).
  const { qualifying, flags } = qualifyCommits(events, input.config, rules, diagnostics);
  allocateCommitExp(qualifying, ctx);
  allocateOtherExp(events, qualifying, ctx);
  allocatePrivateExp(events, ctx);
  // 2. Seasonal progression.
  recordObjectives(events, ctx);
  awardBattles(ctx);
  const seasons = progressSeasons(ctx, input.closureAllowed);
  // 3. Specialization (heroes, mastery, emblems, equipment) and its milestone BP.
  const specialization = evaluateSpecialization(
    ledger,
    prepared,
    input.config,
    rules.version,
    input.runAt,
    diagnostics,
  );
  // 4. Battle Points (activity BP includes the active emblem's bonus).
  awardActivityAndBattleBp(ctx, specialization.emblems.bonusPercent);
  awardLevelBp(ctx);
  // 5. Corrections.
  flagUnavailableSources(new Set(prepared.keys()), new Set(input.unavailableKeys ?? []), ctx);

  const newEntries = ledger.entries.slice(existing.length);
  assertInvariants(ledger.entries, rules);
  return {
    rulesVersion: rules.version,
    newEntries,
    ledger: ledger.entries,
    diagnostics: diagnostics.summary(),
    automationFlags: flags,
    seasons,
    specialization,
    progress: deriveProgress(ledger.entries, seasons, rules, input.config, runMs),
  };
}

export function deriveProgress(
  ledger: readonly LedgerEntry[],
  seasons: readonly SeasonState[],
  rules: Ruleset,
  config: EngineConfig,
  runMs: number,
): Progress {
  const exp = ledger.filter((e) => e.kind === "exp").reduce((s, e) => s + e.amount, 0);
  const bp = ledger.filter((e) => e.kind === "bp").reduce((s, e) => s + e.amount, 0);
  const current = seasons.at(-1);
  let season: RankProgress | null = null;
  if (current) {
    const today = dayOf(runMs, config.timezone);
    const rank = rankFromStars(current.stars, rules);
    const entries = tierEntries(rules);
    let next: RankProgress["next"] = null;
    if (rank.starsForDivision !== null) {
      const target = current.stars - rank.starsInDivision + rank.starsForDivision;
      next = { label: rankFromStars(target, rules).label, starsNeeded: target - current.stars };
    }
    let trial: RankProgress["trial"] = null;
    for (let i = rank.tierIndex + 1; i < rules.tiers.length; i++) {
      const tier = rules.tiers[i] as TierRule;
      if (!tier.trial || (entries[i] ?? 0) <= current.startStars) continue;
      const p = current.trial;
      const r = tier.trial;
      const met =
        p.objectives >= r.objectives &&
        p.contested >= r.contested &&
        p.repos >= (r.repos ?? 0) &&
        p.counterparts >= (r.counterparts ?? 0);
      trial = { tier: tier.id, met, required: r, progress: p };
      break;
    }
    const week = isoWeek(today);
    const weekStars = ledger
      .filter((e) => e.kind === "star" && e.week === week)
      .reduce((s, e) => s + e.amount, 0);
    season = {
      seasonId: current.season.id,
      startDay: current.season.startDay,
      endDay: current.season.endDay,
      daysLeft: Math.max(0, daysBetween(today, current.season.endDay)),
      startStars: current.startStars,
      rawStars: current.rawStars,
      stars: current.stars,
      bankedStars: current.banked,
      rank,
      next,
      trial,
      blockedBy: current.blockedBy,
      weekStars,
      weeklyStarCap: rules.battle.weeklyStarCap,
    };
  }
  return { lifetime: { ...levelProgress(exp, rules), bp }, season };
}

/** Ledger invariants (data-model §3). A violation is an engine bug: fail the run. */
export function assertInvariants(ledger: readonly LedgerEntry[], rules: Ruleset): void {
  const ids = new Set<string>();
  let bp = 0;
  const commitDay = new Map<string, number>();
  const weekStars = new Map<string, number>();
  const weekBp = new Map<string, number>();
  for (const e of ledger) {
    if (ids.has(e.id)) throw new Error(`invariant: duplicate ledger id ${e.id}`);
    ids.add(e.id);
    if (!Number.isInteger(e.amount)) throw new Error(`invariant: non-integer amount in ${e.id}`);
    if (e.kind !== "bp" && e.amount < 0) throw new Error(`invariant: negative amount in ${e.id}`);
    if (e.kind === "bp") {
      bp += e.amount;
      if (bp < 0) throw new Error("invariant: negative BP balance");
      if (e.week && (e.rule === "bp.activity" || e.rule.startsWith("bp.battle")))
        weekBp.set(e.week, (weekBp.get(e.week) ?? 0) + e.amount);
    }
    if (e.rule === "exp.commit" && e.eventDay)
      commitDay.set(e.eventDay, (commitDay.get(e.eventDay) ?? 0) + e.amount);
    if (e.kind === "star" && e.week) weekStars.set(e.week, (weekStars.get(e.week) ?? 0) + e.amount);
  }
  const maxCommit = rules.exp.commitCurve.reduce((s, v) => s + v, 0);
  for (const [day, total] of commitDay)
    if (total > maxCommit) throw new Error(`invariant: commit EXP cap exceeded on ${day}`);
  for (const [week, total] of weekStars)
    if (total > rules.battle.weeklyStarCap)
      throw new Error(`invariant: weekly star cap exceeded in ${week}`);
  for (const [week, total] of weekBp)
    if (total > rules.bp.weeklyCap) throw new Error(`invariant: weekly BP cap exceeded in ${week}`);
}
