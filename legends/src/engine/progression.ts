import type { AnyEvent } from "../normalize/event.ts";
import { type ExpContext, isContestedMerge, isQualifyingReview } from "./exp.ts";
import type { LedgerEntry } from "./ledger.ts";
import { levelForExp, levelUpBp } from "./level.ts";
import { isEstablishedHuman, repoListed, timingOf } from "./qualify.ts";
import { gateStars, rankFromStars, softResetStars, type TrialProgress } from "./rank.ts";
import type { TierRule } from "./rules.ts";
import { dayOf, dayStart, isoWeek, type SeasonInfo, seasonByNumber, seasonOf } from "./time.ts";

const ref = (e: AnyEvent) => `${e.key}@${e.rev}`;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function isSeasonClosed(ctx: ExpContext, seasonId: string): boolean {
  return ctx.ledger.has(`season.close|${seasonId}`);
}

// ------------------------------------------------------------------ objectives (GDD §1.4)

/**
 * Objectives are recorded in the ledger the first time they qualify, so trial progress
 * never decreases when later observations change (P-04, no demotion).
 */
export function recordObjectives(events: readonly AnyEvent[], ctx: ExpContext): void {
  const { rules, config } = ctx;
  type Obj = {
    id: string;
    type: string;
    contested: boolean;
    subject: string;
    repo: string;
    counterparts: number[];
    day: string;
    week: string;
    ms: number;
  };
  const found: Obj[] = [];
  for (const event of events) {
    if (event.repo === null || event.repo.isFork || repoListed(event.repo, config.excludeRepos))
      continue;
    const id = `objective|${event.key}`;
    if (ctx.ledger.has(id)) continue;
    if (
      event.type === "pull_request" &&
      event.metadata.merged &&
      event.metadata.authorIsPlayer &&
      event.actor?.kind !== "bot"
    ) {
      const t = timingOf(
        event.metadata.mergedAt,
        event.firstSeenAt,
        rules,
        config.timezone,
        ctx.runMs,
      );
      if (!t || !isContestedMerge(event, t.eventMs, rules)) continue;
      const approvers = event.metadata.approvers
        .filter((a) =>
          isEstablishedHuman(
            { id: a.id, kind: "user", accountCreatedAt: a.accountCreatedAt },
            t.eventMs,
            rules,
          ),
        )
        .map((a) => a.id);
      const type = approvers.length > 0 ? "reviewed_merge" : "external_merge";
      found.push({
        id,
        type,
        contested: true,
        subject: ref(event),
        repo: event.repo.id,
        counterparts: approvers,
        day: t.effectiveDay,
        week: t.week,
        ms: t.eventMs,
      });
    } else if (event.type === "review" && event.actor?.isPlayer && isQualifyingReview(event)) {
      const t = timingOf(event.occurredAt, event.firstSeenAt, rules, config.timezone, ctx.runMs);
      const author = event.metadata.prAuthor;
      if (!t || !author || !isEstablishedHuman(author, t.eventMs, rules)) continue;
      found.push({
        id,
        type: "peer_review",
        contested: true,
        subject: ref(event),
        repo: event.repo.id,
        counterparts: author.id === null ? [] : [author.id],
        day: t.effectiveDay,
        week: t.week,
        ms: t.eventMs,
      });
    } else if (event.type === "issue") {
      const m = event.metadata;
      if (
        m.state !== "CLOSED" ||
        m.stateReason?.toUpperCase() !== "COMPLETED" ||
        m.closedByPlayer !== true ||
        !event.repo.ownedByPlayer
      )
        continue;
      const t = timingOf(m.closedAt, event.firstSeenAt, rules, config.timezone, ctx.runMs);
      if (!t || !m.author || !isEstablishedHuman(m.author, t.eventMs, rules)) continue;
      found.push({
        id,
        type: "community_fix",
        contested: true,
        subject: ref(event),
        repo: event.repo.id,
        counterparts: m.author.id === null ? [] : [m.author.id],
        day: t.effectiveDay,
        week: t.week,
        ms: t.eventMs,
      });
    } else if (event.type === "release") {
      // A release is an objective when it was rewarded under the release rules (≥ 3 commits, cooldown).
      const exp = ctx.ledger.get(`exp.release|${event.key}`);
      if (!exp?.effectiveDay || !exp.week) continue;
      found.push({
        id,
        type: "release",
        contested: false,
        subject: ref(event),
        repo: event.repo.id,
        counterparts: [],
        day: exp.effectiveDay,
        week: exp.week,
        ms: Number(exp.meta?.publishedMs ?? 0),
      });
    }
  }
  const releasesPerWeek = new Map<string, number>();
  for (const e of ctx.ledger.entries) {
    if (e.rule === "objective.release" && e.amount > 0 && e.week)
      releasesPerWeek.set(e.week, (releasesPerWeek.get(e.week) ?? 0) + 1);
  }
  found.sort((a, b) => cmp(a.day, b.day) || a.ms - b.ms || cmp(a.id, b.id));
  for (const o of found) {
    const season = seasonOf(o.day, config.season1Start);
    if (!season || isSeasonClosed(ctx, season.id)) continue;
    let amount = 1;
    if (o.type === "release") {
      const n = releasesPerWeek.get(o.week) ?? 0;
      if (n >= rules.objectives.releaseObjectivesPerWeek) amount = 0;
      else releasesPerWeek.set(o.week, n + 1);
    }
    const entry: LedgerEntry = {
      id: o.id,
      kind: "trial",
      rule: `objective.${o.type}`,
      ruleVersion: rules.version,
      subject: [o.subject],
      amount,
      effectiveDay: o.day,
      week: o.week,
      season: season.id,
      createdAt: ctx.runAt,
      meta: {
        contested: o.contested,
        repo: o.repo,
        counterparts: o.counterparts.sort((a, b) => a - b).join(","),
      },
    };
    if (amount === 0) entry.reason = "weekly_cap";
    ctx.ledger.add(entry);
  }
}

// ------------------------------------------------------------------ battles (GDD §A.4, tables §2.1)

/**
 * One battle per active player day (effective date), scored by the EXP awarded that day
 * (private aggregate EXP excluded: it has no day attribution). Stars are awarded as soon
 * as the score crosses a threshold; scores only grow, so awards never need revoking.
 */
export function awardBattles(ctx: ExpContext): void {
  const { rules, config } = ctx;
  const b = rules.battle;
  const scores = new Map<string, number>();
  for (const e of ctx.ledger.entries) {
    if (e.kind !== "exp" || e.rule === "exp.private" || !e.effectiveDay) continue;
    scores.set(e.effectiveDay, (scores.get(e.effectiveDay) ?? 0) + e.amount);
  }
  const contestedDays = new Set(
    ctx.ledger.entries
      .filter(
        (e) => e.kind === "trial" && e.meta?.contested === true && e.amount > 0 && e.effectiveDay,
      )
      .map((e) => e.effectiveDay as string),
  );
  const weekStars = new Map<string, number>();
  for (const e of ctx.ledger.entries) {
    if (e.kind === "star" && e.week) weekStars.set(e.week, (weekStars.get(e.week) ?? 0) + e.amount);
  }
  for (const day of [...scores.keys()].sort()) {
    const score = scores.get(day) ?? 0;
    const season = seasonOf(day, config.season1Start);
    if (!season || isSeasonClosed(ctx, season.id) || score < b.victoryScore) continue;
    const week = isoWeek(day);
    const award = (id: string, rule: string, level: string) => {
      if (ctx.ledger.has(id)) return;
      const used = weekStars.get(week) ?? 0;
      const amount = used < b.weeklyStarCap ? 1 : 0;
      weekStars.set(week, used + amount);
      const entry: LedgerEntry = {
        id,
        kind: "star",
        rule,
        ruleVersion: rules.version,
        subject: [day],
        amount,
        effectiveDay: day,
        week,
        season: season.id,
        createdAt: ctx.runAt,
        meta: { score, result: level },
      };
      if (amount === 0) entry.reason = "overflow";
      ctx.ledger.add(entry);
    };
    award(`star.victory|${day}`, "star.victory", "victory");
    if (score >= b.mvpScore && contestedDays.has(day)) award(`star.mvp|${day}`, "star.mvp", "mvp");
  }
}

// ------------------------------------------------------------------ seasons and rank (GDD §A.3–A.5, §H)

export interface SeasonState {
  season: SeasonInfo;
  startStars: number;
  rawStars: number;
  stars: number;
  banked: number;
  blockedBy: string | null;
  trial: TrialProgress;
  closed: boolean;
}

function trialFrom(entries: readonly LedgerEntry[]): TrialProgress {
  const repos = new Set<string>();
  const counterparts = new Set<string>();
  let objectives = 0;
  let contested = 0;
  for (const e of entries) {
    if (e.kind !== "trial" || e.amount <= 0) continue;
    objectives += e.amount;
    if (e.meta?.contested === true) contested += e.amount;
    if (typeof e.meta?.repo === "string") repos.add(e.meta.repo);
    for (const id of String(e.meta?.counterparts ?? "").split(",")) if (id) counterparts.add(id);
  }
  return { objectives, contested, repos: repos.size, counterparts: counterparts.size };
}

/**
 * Walks Season 1 → the current season: soft resets, first-time tier BP (on the day the
 * gated rank first reaches the tier), and season closure with season-end BP. Closed
 * seasons are immutable; their recorded final stars drive the next soft reset.
 */
export function progressSeasons(ctx: ExpContext, closureAllowed: boolean): SeasonState[] {
  const { rules, config } = ctx;
  const today = dayOf(ctx.runMs, config.timezone);
  const current = seasonOf(today, config.season1Start);
  if (!current) return [];
  const states: SeasonState[] = [];
  let startStars = 0;
  for (let n = 1; n <= current.number; n++) {
    const season = seasonByNumber(n, config.season1Start);
    const inSeason = ctx.ledger.entries.filter((e) => e.season === season.id);
    const closeEntry = ctx.ledger.get(`season.close|${season.id}`);
    const timeline = [
      ...new Set(
        inSeason
          .filter((e) => e.kind === "star" || e.kind === "trial")
          .map((e) => e.effectiveDay ?? ""),
      ),
    ].sort();
    const startTier = rankFromStars(startStars, rules).tierIndex;

    let raw = 0;
    let gated = { effective: startStars, banked: 0, blockedBy: null as string | null };
    let trial: TrialProgress = { objectives: 0, contested: 0, repos: 0, counterparts: 0 };
    for (const day of timeline) {
      const upTo = inSeason.filter((e) => (e.effectiveDay ?? "") <= day);
      raw = upTo.filter((e) => e.kind === "star").reduce((s, e) => s + e.amount, 0);
      trial = trialFrom(upTo);
      gated = gateStars(startStars + raw, startStars, trial, rules);
      if (closeEntry) continue;
      const tierIndex = rankFromStars(gated.effective, rules).tierIndex;
      for (let t = startTier + 1; t <= tierIndex; t++) {
        const tier = rules.tiers[t] as TierRule;
        if (tier.firstTimeBp <= 0) continue;
        ctx.ledger.add({
          id: `bp.tier|${season.id}|${tier.id}`,
          kind: "bp",
          rule: "bp.tier_first",
          ruleVersion: rules.version,
          subject: [season.id],
          amount: tier.firstTimeBp,
          effectiveDay: day,
          week: isoWeek(day),
          season: season.id,
          createdAt: ctx.runAt,
          meta: { tier: tier.id },
        });
      }
    }

    const nextStart = seasonByNumber(n + 1, config.season1Start).startDay;
    const closable =
      ctx.runMs >= dayStart(nextStart, config.timezone) + rules.time.closureGraceHours * 3_600_000;
    let finalStars = gated.effective;
    if (closeEntry) {
      finalStars = Number(closeEntry.meta?.finalStars ?? finalStars);
    } else if (closable && closureAllowed) {
      const peak = rankFromStars(finalStars, rules);
      const peakTier = rules.tiers[peak.tierIndex] as TierRule;
      ctx.ledger.add({
        id: `season.close|${season.id}`,
        kind: "season",
        rule: "season.close",
        ruleVersion: rules.version,
        subject: [season.id],
        amount: 0,
        effectiveDay: season.endDay,
        season: season.id,
        createdAt: ctx.runAt,
        meta: {
          finalStars,
          peakTier: peakTier.id,
          rawStars: startStars + raw,
          banked: gated.banked,
          startStars,
        },
      });
      ctx.ledger.add({
        id: `bp.season_end|${season.id}`,
        kind: "bp",
        rule: "bp.season_end",
        ruleVersion: rules.version,
        subject: [season.id],
        amount: peakTier.seasonEndBp,
        effectiveDay: season.endDay,
        season: season.id,
        createdAt: ctx.runAt,
        meta: { peakTier: peakTier.id },
      });
    }
    states.push({
      season,
      startStars,
      rawStars: startStars + raw,
      stars: finalStars,
      banked: gated.banked,
      blockedBy: gated.blockedBy,
      trial,
      closed: ctx.ledger.has(`season.close|${season.id}`),
    });
    startStars = softResetStars(finalStars, rules);
  }
  return states;
}

// ------------------------------------------------------------------ Battle Points (economy §3)

/**
 * Activity BP (20% of each EXP award, floor) and battle BP share a 700 BP weekly cap.
 * Activity BP is not granted for days before Season 1 (PRD §10, PD-10).
 */
export function awardActivityAndBattleBp(
  ctx: ExpContext,
  bonusPercent: (expEntry: LedgerEntry) => number = () => 0,
): void {
  const { rules, config } = ctx;
  type Item = {
    id: string;
    rule: string;
    base: number;
    day: string;
    week: string;
    order: number;
    source: string;
    season?: string;
  };
  const items: Item[] = [];
  for (const e of ctx.ledger.entries) {
    if (!e.effectiveDay || !e.week || !seasonOf(e.effectiveDay, config.season1Start)) continue;
    if (e.kind === "exp" && e.amount > 0) {
      // Activity BP = floor(20% of EXP); an active emblem adds its bonus with floor rounding (GDD §D.4).
      const plain = Math.floor((e.amount * rules.bp.activityPercent) / 100);
      const base = Math.floor((plain * (100 + bonusPercent(e))) / 100);
      if (base > 0)
        items.push({
          id: `bp.activity|${e.id}`,
          rule: "bp.activity",
          base,
          day: e.effectiveDay,
          week: e.week,
          order: 0,
          source: e.id,
          ...(e.season ? { season: e.season } : {}),
        });
    } else if (e.kind === "star") {
      const victory = e.rule === "star.victory";
      items.push({
        id: `bp.battle.${victory ? "victory" : "mvp"}|${e.effectiveDay}`,
        rule: victory ? "bp.battle_victory" : "bp.battle_mvp",
        base: victory ? rules.battle.victoryBp : rules.battle.mvpBp - rules.battle.victoryBp,
        day: e.effectiveDay,
        week: e.week,
        order: 1,
        source: e.id,
        ...(e.season ? { season: e.season } : {}),
      });
    }
  }
  const used = new Map<string, number>();
  for (const e of ctx.ledger.entries) {
    if (e.kind === "bp" && e.week && (e.rule === "bp.activity" || e.rule.startsWith("bp.battle")))
      used.set(e.week, (used.get(e.week) ?? 0) + e.amount);
  }
  items.sort((a, b) => cmp(a.day, b.day) || a.order - b.order || cmp(a.id, b.id));
  for (const item of items) {
    if (ctx.ledger.has(item.id)) continue;
    const remaining = Math.max(0, rules.bp.weeklyCap - (used.get(item.week) ?? 0));
    const amount = Math.min(item.base, remaining);
    used.set(item.week, (used.get(item.week) ?? 0) + amount);
    const entry: LedgerEntry = {
      id: item.id,
      kind: "bp",
      rule: item.rule,
      ruleVersion: rules.version,
      subject: [item.source],
      amount,
      effectiveDay: item.day,
      week: item.week,
      createdAt: ctx.runAt,
    };
    if (item.season) entry.season = item.season;
    if (amount < item.base) entry.reason = "weekly_cap";
    ctx.ledger.add(entry);
  }
}

/** Level-up BP (tables §1): granted for every level reached, including through backfill (PD-10). */
export function awardLevelBp(ctx: ExpContext): void {
  const { rules } = ctx;
  const exps = ctx.ledger.entries
    .filter((e) => e.kind === "exp" && e.amount > 0)
    .sort((a, b) => cmp(a.eventDay ?? "", b.eventDay ?? "") || cmp(a.id, b.id));
  const total = exps.reduce((s, e) => s + e.amount, 0);
  const level = levelForExp(total, rules);
  let cumulative = 0;
  let cursor = 0;
  for (let n = 2; n <= level; n++) {
    const threshold = rules.level.base * (n - 1) + (rules.level.step * (n - 1) * (n - 2)) / 2;
    while (cumulative < threshold && cursor < exps.length)
      cumulative += exps[cursor++]?.amount ?? 0;
    const day = exps[Math.max(0, cursor - 1)]?.eventDay;
    const entry: LedgerEntry = {
      id: `bp.level|${n}`,
      kind: "bp",
      rule: "bp.level_up",
      ruleVersion: rules.version,
      subject: [`level:${n}`],
      amount: levelUpBp(n, rules),
      createdAt: ctx.runAt,
      meta: { level: n },
    };
    if (day) entry.effectiveDay = day;
    ctx.ledger.add(entry);
  }
}

// ------------------------------------------------------------------ corrections

/**
 * Deleted or withdrawn sources (repo deleted, commit force-pushed away) never revoke
 * awards (PRD INT-4). The engine records one zero-amount flag per affected event key.
 */
export function flagUnavailableSources(
  present: ReadonlySet<string>,
  unavailable: ReadonlySet<string>,
  ctx: ExpContext,
): void {
  const keys = new Set<string>();
  for (const e of ctx.ledger.entries) {
    if (e.kind === "flag") continue;
    for (const s of e.subject) {
      const at = s.lastIndexOf("@");
      if (at <= 0) continue;
      const key = s.slice(0, at);
      if (!present.has(key) || unavailable.has(key)) keys.add(key);
    }
  }
  for (const key of [...keys].sort()) {
    ctx.ledger.add({
      id: `flag.source_unavailable|${key}`,
      kind: "flag",
      rule: "flag.source_unavailable",
      ruleVersion: ctx.rules.version,
      subject: [key],
      amount: 0,
      createdAt: ctx.runAt,
    });
  }
}
