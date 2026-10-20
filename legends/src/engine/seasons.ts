/**
 * Season records (GDD §H, data-model §6): three separate views of progression.
 *
 * - Lifetime: EXP, level, BP, medals and campaigns. Never reset by a season ending.
 * - Current season: stars, rank and this season's activity.
 * - Archived seasons: the summary frozen into the `season.close` ledger entry when the
 *   season closed. An archive is read back from that entry only, so later runs, later
 *   rule versions or late-arriving events can never change it.
 *
 * Also computes schedule hints: the next day, week and season boundaries in the player's
 * timezone and the periods still waiting to close (48 h grace or the closure guard).
 */
import type { ExpContext } from "./exp.ts";
import type { Facts } from "./facts.ts";
import { type CommitCredit, milliShare } from "./heroes/attribution.ts";
import { heroForLanguage } from "./heroes/catalog.ts";
import type { SpecializationResult } from "./heroes/index.ts";
import type { LedgerEntry } from "./ledger.ts";
import { type LevelProgress, levelProgress } from "./level.ts";
import type { ArchiveMetaFn, SeasonState } from "./progression.ts";
import type { EngineConfig } from "./qualify.ts";
import { mondayOf } from "./quests/engine.ts";
import { rankFromStars } from "./rank.ts";
import type { Ruleset } from "./rules.ts";
import { addDays, dayOf, dayStart, daysBetween, seasonByNumber, seasonOf } from "./time.ts";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const inRange = (day: string | undefined, start: string, end: string) =>
  day !== undefined && day >= start && day <= end;

interface SeasonStats {
  battles: number;
  victories: number;
  mvps: number;
  skirmishes: number;
  bestScore: number;
  expEarned: number;
  bpEarned: number;
  bpSpent: number;
  dailyQuests: number;
  weeklyQuests: number;
  specialtyQuests: number;
  contracts: number;
  medals: number;
  /** Medal tiers earned in the window, as `<id>:<tier>` (comma-separated). */
  medalIds: string;
  topHeroes: string;
  emblemMostUsed: string;
}

/** Activity totals for one season window, from the ledger and the verified facts. */
function seasonStats(
  ledger: readonly LedgerEntry[],
  facts: Facts,
  credits: readonly CommitCredit[],
  start: string,
  end: string,
): SeasonStats {
  const battles = [...facts.battles.values()].filter((b) => inRange(b.day, start, end));
  const entries = ledger.filter((e) => inRange(e.effectiveDay, start, end));
  const quests = (pool: string) =>
    entries.filter((e) => e.rule === "quest.complete" && e.meta?.pool === pool).length;
  const bp = entries.filter((e) => e.kind === "bp" && e.rule !== "bp.season_end");

  // Mastery points gained per hero this season (same split as mastery: EXP × byte share).
  const mpMilli = new Map<string, number>();
  const effective = new Map(
    entries.filter((e) => e.rule === "exp.commit").map((e) => [e.id, e.effectiveDay]),
  );
  for (const credit of credits) {
    if (!credit.languages || !effective.has(credit.entryId)) continue;
    for (const [language, bytes] of Object.entries(credit.languages)) {
      const hero = heroForLanguage(language);
      const milli = milliShare(credit.exp, bytes, credit.totalBytes);
      if (hero && milli > 0) mpMilli.set(hero.id, (mpMilli.get(hero.id) ?? 0) + milli);
    }
  }
  const topHeroes = [...mpMilli.entries()]
    .filter(([, milli]) => milli >= 1000)
    .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .slice(0, 3)
    .map(([h, milli]) => `${h}:${Math.floor(milli / 1000)}`);

  // Active emblem per day: the latest activation on or before that day.
  const activations = ledger
    .filter((e) => e.rule === "emblem.activate")
    .sort((a, b) => cmp(a.effectiveDay ?? "", b.effectiveDay ?? ""));
  const emblemDays = new Map<string, number>();
  if (activations.length > 0) {
    let i = 0;
    let active: string | null = null;
    for (let day = start; day <= end; day = addDays(day, 1)) {
      while (i < activations.length && (activations[i]?.effectiveDay ?? "") <= day)
        active = String(activations[i++]?.meta?.emblem ?? "none");
      if (active && active !== "none") emblemDays.set(active, (emblemDays.get(active) ?? 0) + 1);
    }
  }
  const emblemMostUsed =
    [...emblemDays.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0]?.[0] ?? "none";

  return {
    battles: battles.length,
    victories: battles.filter((b) => b.victory).length,
    mvps: battles.filter((b) => b.mvp).length,
    skirmishes: battles.filter((b) => !b.victory).length,
    bestScore: Math.max(0, ...battles.map((b) => b.score)),
    expEarned: entries.filter((e) => e.kind === "exp").reduce((s, e) => s + e.amount, 0),
    bpEarned: bp.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0),
    bpSpent: -bp.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0),
    dailyQuests: quests("daily"),
    weeklyQuests: quests("weekly"),
    specialtyQuests: quests("specialty"),
    contracts: quests("contract"),
    medals: entries.filter((e) => e.kind === "medal").length,
    medalIds: entries
      .filter((e) => e.kind === "medal")
      .map((e) => `${e.meta?.medal}:${e.meta?.tier}`)
      .sort()
      .join(","),
    topHeroes: topHeroes.join(","),
    emblemMostUsed,
  };
}

/** The summary frozen into `season.close` (only called when the season closes). */
export function archiveMetaFor(
  ctx: ExpContext,
  facts: Facts,
  spec: SpecializationResult,
): ArchiveMetaFn {
  return (season, state) => {
    const stats = seasonStats(
      ctx.ledger.entries,
      facts,
      spec.attribution.credits,
      season.startDay,
      season.endDay,
    );
    const tier = rankFromStars(state.stars, ctx.rules).tierIndex;
    return {
      ...stats,
      starsEarned: state.rawStars - state.startStars,
      trialsCompleted: Object.keys(state.trialMet).length,
      finalRank: rankFromStars(state.stars, ctx.rules).label,
      // Season badge is the archive itself; the season frame is for Champion and above (GDD §H.3).
      seasonFrame: tier >= ctx.rules.tiers.findIndex((t) => t.id === "champion"),
      archiveVersion: 1,
    };
  };
}

export interface SeasonArchive {
  seasonId: string;
  number: number;
  startDay: string;
  endDay: string;
  closedAt: string;
  rulesVersion: string;
  finalStars: number;
  peakTier: string;
  finalRank: string | null;
  seasonEndBp: number;
  /** Season frame cosmetic (Champion and above), as frozen at closure. */
  seasonFrame: boolean;
  /** Frozen counters (missing for seasons archived before archiveVersion 1). */
  stats: Partial<SeasonStats & { starsEarned: number; trialsCompleted: number; banked: number }>;
}

export interface SeasonsView {
  lifetime: LevelProgress & {
    bp: number;
    bpEarned: number;
    bpSpent: number;
    medals: number;
    questsCompleted: number;
    campaignsCompleted: number;
    seasonsArchived: number;
    bestPeakTier: string | null;
  };
  current: {
    seasonId: string;
    startDay: string;
    endDay: string;
    daysLeft: number;
    stars: number;
    rank: string;
    stats: SeasonStats;
  } | null;
  archived: SeasonArchive[];
}

const NUMERIC_STATS = [
  "battles",
  "victories",
  "mvps",
  "skirmishes",
  "bestScore",
  "expEarned",
  "bpEarned",
  "bpSpent",
  "dailyQuests",
  "weeklyQuests",
  "specialtyQuests",
  "contracts",
  "medals",
  "starsEarned",
  "trialsCompleted",
  "banked",
] as const;

/** Archives come only from `season.close` entries: frozen, never recomputed. */
export function seasonArchives(
  ledger: readonly LedgerEntry[],
  config: EngineConfig,
): SeasonArchive[] {
  const endBp = new Map(
    ledger.filter((e) => e.rule === "bp.season_end").map((e) => [e.season ?? "", e.amount]),
  );
  return ledger
    .filter((e) => e.rule === "season.close")
    .map((e) => {
      const number = Number((e.season ?? "S0").slice(1));
      const info = seasonByNumber(number, config.season1Start);
      const m = e.meta ?? {};
      const stats: SeasonArchive["stats"] = {};
      for (const k of NUMERIC_STATS) if (typeof m[k] === "number") stats[k] = m[k] as number;
      if (typeof m.topHeroes === "string") stats.topHeroes = m.topHeroes;
      if (typeof m.medalIds === "string") stats.medalIds = m.medalIds;
      if (typeof m.emblemMostUsed === "string") stats.emblemMostUsed = m.emblemMostUsed;
      return {
        seasonId: e.season ?? "",
        number,
        startDay: info.startDay,
        endDay: info.endDay,
        closedAt: e.createdAt,
        rulesVersion: e.ruleVersion,
        finalStars: Number(m.finalStars ?? 0),
        peakTier: String(m.peakTier ?? ""),
        finalRank: typeof m.finalRank === "string" ? m.finalRank : null,
        seasonEndBp: endBp.get(e.season ?? "") ?? 0,
        seasonFrame: m.seasonFrame === true,
        stats,
      };
    })
    .sort((a, b) => a.number - b.number);
}

export function seasonsView(
  ledger: readonly LedgerEntry[],
  seasons: readonly SeasonState[],
  facts: Facts,
  spec: SpecializationResult,
  rules: Ruleset,
  config: EngineConfig,
  runMs: number,
): SeasonsView {
  const sum = (pred: (e: LedgerEntry) => boolean) =>
    ledger.filter(pred).reduce((s, e) => s + e.amount, 0);
  const archived = seasonArchives(ledger, config);
  const tierOrder = (id: string) => rules.tiers.findIndex((t) => t.id === id);
  const best = [...archived].sort((a, b) => tierOrder(b.peakTier) - tierOrder(a.peakTier))[0];
  const today = dayOf(runMs, config.timezone);
  const open = seasons.at(-1);
  const current =
    open && !open.closed && inRange(today, open.season.startDay, open.season.endDay)
      ? open
      : undefined;
  return {
    lifetime: {
      ...levelProgress(
        sum((e) => e.kind === "exp"),
        rules,
      ),
      bp: sum((e) => e.kind === "bp"),
      bpEarned: sum((e) => e.kind === "bp" && e.amount > 0),
      bpSpent: -sum((e) => e.kind === "bp" && e.amount < 0),
      medals: ledger.filter((e) => e.kind === "medal").length,
      questsCompleted: ledger.filter((e) => e.rule === "quest.complete").length,
      campaignsCompleted: ledger.filter((e) => e.rule === "campaign.complete").length,
      seasonsArchived: archived.length,
      bestPeakTier: best?.peakTier ?? null,
    },
    current: current
      ? {
          seasonId: current.season.id,
          startDay: current.season.startDay,
          endDay: current.season.endDay,
          daysLeft: Math.max(0, daysBetween(today, current.season.endDay)),
          stars: current.stars,
          rank: rankFromStars(current.stars, rules).label,
          stats: seasonStats(
            ledger,
            facts,
            spec.attribution.credits,
            current.season.startDay,
            today,
          ),
        }
      : null,
    archived,
  };
}

export interface PendingClosure {
  kind: "daily" | "weekly" | "specialty" | "contract" | "season";
  period: string;
  /** Earliest instant the period may close (end of period + 48 h grace). */
  closesAt: string;
  /** "grace": still inside the 48 h window. "source_completeness": waiting on the closure guard. */
  waitingFor: "grace" | "source_completeness";
}

export interface ScheduleView {
  timezone: string;
  asOf: string;
  today: string;
  nextDayStartsAt: string;
  nextWeekStartsAt: string;
  nextSeasonStartsAt: string;
  pending: PendingClosure[];
}

/**
 * Boundaries the scheduler cares about. Runs are catch-up: every run evaluates all open
 * periods since Season 1, so a missed or late run delays rewards but never loses them.
 */
export function scheduleView(
  ledger: readonly LedgerEntry[],
  rules: Ruleset,
  config: EngineConfig,
  runMs: number,
  runAt: string,
): ScheduleView {
  const tz = config.timezone;
  const today = dayOf(runMs, tz);
  const iso = (ms: number) => new Date(ms).toISOString();
  const grace = rules.time.closureGraceHours * 3_600_000;
  const closesAt = (endDay: string) => dayStart(addDays(endDay, 1), tz) + grace;
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const season = seasonOf(today, config.season1Start);
  const nextSeason = season
    ? seasonByNumber(season.number + 1, config.season1Start).startDay
    : config.season1Start;

  const pending: PendingClosure[] = [];
  const add = (kind: PendingClosure["kind"], period: string, end: string) => {
    if (end >= today) return;
    const at = closesAt(end);
    pending.push({
      kind,
      period,
      closesAt: iso(at),
      waitingFor: runMs >= at ? "source_completeness" : "grace",
    });
  };
  const closed = new Set(
    ledger
      .filter((e) => e.rule === "quest.period_closed" || e.rule === "season.close")
      .map((e) => e.id),
  );
  for (const e of ledger) {
    if (e.rule !== "quest.board") continue;
    const pool = String(e.meta?.pool ?? "") as PendingClosure["kind"];
    const period = String(e.meta?.period ?? "");
    if (closed.has(`quest.closed|${pool}|${period}`)) continue;
    const end =
      pool === "daily"
        ? period
        : pool === "contract"
          ? seasonByNumber(Number(period.slice(1)), config.season1Start).endDay
          : addDays(mondayOf(e.effectiveDay ?? period), 6);
    add(pool, period, end);
  }
  if (season)
    for (let n = 1; n < season.number; n++) {
      const s = seasonByNumber(n, config.season1Start);
      if (!closed.has(`season.close|${s.id}`)) add("season", s.id, s.endDay);
    }
  pending.sort(
    (a, b) => cmp(a.closesAt, b.closesAt) || cmp(a.kind, b.kind) || cmp(a.period, b.period),
  );

  return {
    timezone: tz,
    asOf: runAt,
    today,
    nextDayStartsAt: iso(dayStart(addDays(today, 1), tz)),
    nextWeekStartsAt: iso(dayStart(addDays(today, 7 - weekday), tz)),
    nextSeasonStartsAt: iso(dayStart(nextSeason > today ? nextSeason : addDays(today, 1), tz)),
    pending,
  };
}
