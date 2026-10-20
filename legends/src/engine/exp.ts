import type { AnyEvent, NormalizedEvent } from "../normalize/event.ts";
import type { LedgerEntry, LedgerIndex } from "./ledger.ts";
import {
  type Diagnostics,
  type EngineConfig,
  isEstablishedHuman,
  type QualifiedCommit,
  repoListed,
  type Timing,
  timingOf,
} from "./qualify.ts";
import type { Ruleset } from "./rules.ts";
import { dayOf, isoWeek, parseInstant, seasonOf } from "./time.ts";

export interface ExpContext {
  rules: Ruleset;
  config: EngineConfig;
  ledger: LedgerIndex;
  diagnostics: Diagnostics;
  runAt: string;
  runMs: number;
}

interface Candidate {
  id: string;
  rule: string;
  base: number;
  /** Daily cap group (rules sharing a cap). */
  capGroup: string;
  cap: number;
  timing: Timing;
  subject: string;
  meta?: Record<string, string | number | boolean>;
  /** Self-merged PRs: limited by count per day as well. */
  selfPr?: boolean;
}

export function expEntry(
  ctx: ExpContext,
  c: Omit<Candidate, "base" | "capGroup" | "cap">,
  amount: number,
  base: number,
): LedgerEntry {
  const season = seasonOf(c.timing.effectiveDay, ctx.config.season1Start);
  const entry: LedgerEntry = {
    id: c.id,
    kind: "exp",
    rule: c.rule,
    ruleVersion: ctx.rules.version,
    subject: [c.subject],
    amount,
    eventDay: c.timing.eventDay,
    effectiveDay: c.timing.effectiveDay,
    week: c.timing.week,
    createdAt: ctx.runAt,
  };
  if (amount < base) entry.reason = "capped";
  if (season) entry.season = season.id;
  if (c.meta) entry.meta = { ...c.meta };
  return entry;
}

const ref = (e: AnyEvent) => `${e.key}@${e.rev}`;

/** Allocates commit EXP with the diminishing curve, continuing ordinals already used that day (ADR-0006). */
export function allocateCommitExp(commits: readonly QualifiedCommit[], ctx: ExpContext): void {
  const curve = ctx.rules.exp.commitCurve;
  const usedOrdinals = new Map<string, number>();
  for (const e of ctx.ledger.entries) {
    if (e.rule === "exp.commit" && e.eventDay)
      usedOrdinals.set(e.eventDay, (usedOrdinals.get(e.eventDay) ?? 0) + 1);
  }
  for (const c of commits) {
    const id = `exp.commit|${c.event.key}`;
    if (ctx.ledger.has(id)) continue;
    const ordinal = (usedOrdinals.get(c.timing.eventDay) ?? 0) + 1;
    usedOrdinals.set(c.timing.eventDay, ordinal);
    const amount = curve[ordinal - 1] ?? 0;
    const base = curve[0] ?? 0;
    const entry = expEntry(
      ctx,
      { id, rule: "exp.commit", timing: c.timing, subject: ref(c.event), meta: { ordinal } },
      amount,
      base,
    );
    // Commits past the curve are "capped"; commits 6–10 earn the curve value as designed (not capped).
    if (amount === (curve[ordinal - 1] ?? -1)) delete entry.reason;
    ctx.ledger.add(entry);
  }
}

function sortCandidates(list: Candidate[]): Candidate[] {
  return list.sort(
    (a, b) => a.timing.eventMs - b.timing.eventMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Generic daily-cap allocation for PRs, reviews, issues and releases (economy-balancing §2). */
function allocateCapped(candidates: Candidate[], ctx: ExpContext): void {
  const used = new Map<string, number>();
  const selfCount = new Map<string, number>();
  const groups = new Set(candidates.map((c) => c.capGroup));
  for (const e of ctx.ledger.entries) {
    if (e.kind !== "exp" || !e.eventDay) continue;
    const group = capGroupOf(e.rule);
    if (!groups.has(group)) continue;
    used.set(`${group}|${e.eventDay}`, (used.get(`${group}|${e.eventDay}`) ?? 0) + e.amount);
    if (e.meta?.self === true && e.amount > 0)
      selfCount.set(e.eventDay, (selfCount.get(e.eventDay) ?? 0) + 1);
  }
  for (const c of sortCandidates(candidates)) {
    if (ctx.ledger.has(c.id)) continue;
    const slot = `${c.capGroup}|${c.timing.eventDay}`;
    const remaining = Math.max(0, c.cap - (used.get(slot) ?? 0));
    let amount = Math.min(c.base, remaining);
    if (c.selfPr && (selfCount.get(c.timing.eventDay) ?? 0) >= ctx.rules.exp.prSelfDailyCount)
      amount = 0;
    used.set(slot, (used.get(slot) ?? 0) + amount);
    if (c.selfPr && amount > 0)
      selfCount.set(c.timing.eventDay, (selfCount.get(c.timing.eventDay) ?? 0) + 1);
    ctx.ledger.add(expEntry(ctx, c, amount, c.base));
  }
}

function capGroupOf(rule: string): string {
  if (rule === "exp.pr") return "pr";
  if (rule === "exp.review") return "review";
  if (rule === "exp.issue_opened") return "issue_opened";
  if (rule === "exp.issue_resolved") return "issue_resolved";
  if (rule === "exp.release") return "release";
  return rule;
}

function creditable(event: AnyEvent, config: EngineConfig): boolean {
  return event.repo !== null && !event.repo.isFork && !repoListed(event.repo, config.excludeRepos);
}

export function isContestedMerge(
  pr: NormalizedEvent<"pull_request">,
  mergedMs: number,
  rules: Ruleset,
): boolean {
  if (pr.repo && !pr.repo.ownedByPlayer) return true;
  return pr.metadata.approvers.some((a) =>
    isEstablishedHuman(
      { id: a.id, kind: "user", accountCreatedAt: a.accountCreatedAt },
      mergedMs,
      rules,
    ),
  );
}

/** Qualifying review (PRD §4.1, GDD §1.4): by the player, on a human's PR, with a substantive state. */
export function isQualifyingReview(r: NormalizedEvent<"review">): boolean {
  const author = r.metadata.prAuthor;
  if (author === null || author.isPlayer || author.kind !== "user") return false;
  const state = r.metadata.state.toUpperCase();
  return (
    state === "APPROVED" ||
    state === "CHANGES_REQUESTED" ||
    (state === "COMMENTED" && r.metadata.hasBody)
  );
}

export function allocateOtherExp(
  events: readonly AnyEvent[],
  commits: readonly QualifiedCommit[],
  ctx: ExpContext,
): void {
  const { rules, config, diagnostics } = ctx;
  const x = rules.exp;
  const candidates: Candidate[] = [];
  const releases: Array<{ event: NormalizedEvent<"release">; timing: Timing }> = [];

  for (const event of events) {
    switch (event.type) {
      case "pull_request": {
        const m = event.metadata;
        if (!m.merged) break;
        const timing = timingOf(m.mergedAt, event.firstSeenAt, rules, config.timezone, ctx.runMs);
        if (timing === null) {
          diagnostics.add("invalid_timestamp", event.key);
          break;
        }
        if (event.actor === null) {
          diagnostics.add("missing_actor", event.key);
          break;
        }
        if (event.actor.kind === "bot") {
          diagnostics.add("bot_actor", event.key);
          break;
        }
        if (!m.authorIsPlayer) break;
        if (!creditable(event, config)) {
          diagnostics.add("excluded_repo", event.key);
          break;
        }
        const contested = isContestedMerge(event, timing.eventMs, rules);
        const c: Candidate = {
          id: `exp.pr|${event.key}`,
          rule: "exp.pr",
          base: contested ? x.prContested : x.prSelf,
          capGroup: "pr",
          cap: x.prDailyCap,
          timing,
          subject: ref(event),
          meta: { self: !contested },
        };
        if (!contested) c.selfPr = true;
        candidates.push(c);
        break;
      }
      case "review": {
        const timing = timingOf(
          event.occurredAt,
          event.firstSeenAt,
          rules,
          config.timezone,
          ctx.runMs,
        );
        if (timing === null) {
          diagnostics.add("invalid_timestamp", event.key);
          break;
        }
        if (event.metadata.prAuthor === null) {
          diagnostics.add("missing_actor", event.key);
          break;
        }
        if (!event.actor?.isPlayer) break;
        if (!creditable(event, config)) {
          diagnostics.add("excluded_repo", event.key);
          break;
        }
        if (!isQualifyingReview(event)) {
          diagnostics.add("review_not_qualifying", event.key);
          break;
        }
        candidates.push({
          id: `exp.review|${event.key}`,
          rule: "exp.review",
          base: x.review,
          capGroup: "review",
          cap: x.reviewDailyCap,
          timing,
          subject: ref(event),
        });
        break;
      }
      case "issue": {
        const m = event.metadata;
        if (!creditable(event, config)) break;
        if (m.author?.isPlayer) {
          const timing = timingOf(
            m.createdAt,
            event.firstSeenAt,
            rules,
            config.timezone,
            ctx.runMs,
          );
          const createdMs = parseInstant(m.createdAt);
          if (timing === null || createdMs === null)
            diagnostics.add("invalid_timestamp", event.key);
          else if (ctx.runMs - createdMs < x.issueOpenedSettleHours * 3_600_000)
            diagnostics.add("issue_settling", event.key);
          else if (!closedNotPlannedQuickly(event, x.issueOpenedSettleHours)) {
            candidates.push({
              id: `exp.issue_opened|${event.key}`,
              rule: "exp.issue_opened",
              base: x.issueOpened,
              capGroup: "issue_opened",
              cap: x.issueOpenedDailyCap,
              timing,
              subject: ref(event),
            });
          } else diagnostics.add("issue_closed_not_planned", event.key);
        } else if (m.author === null) diagnostics.add("missing_actor", event.key);
        if (
          m.state === "CLOSED" &&
          m.stateReason?.toUpperCase() === "COMPLETED" &&
          m.closedByPlayer === true &&
          event.repo?.ownedByPlayer
        ) {
          const timing = timingOf(m.closedAt, event.firstSeenAt, rules, config.timezone, ctx.runMs);
          if (timing === null) diagnostics.add("invalid_timestamp", event.key);
          else
            candidates.push({
              id: `exp.issue_resolved|${event.key}`,
              rule: "exp.issue_resolved",
              base: x.issueResolved,
              capGroup: "issue_resolved",
              cap: x.issueResolvedDailyCap,
              timing,
              subject: ref(event),
            });
        }
        break;
      }
      case "release": {
        const m = event.metadata;
        if (m.isDraft) break;
        const timing = timingOf(
          m.publishedAt,
          event.firstSeenAt,
          rules,
          config.timezone,
          ctx.runMs,
        );
        if (timing === null) {
          diagnostics.add("invalid_timestamp", event.key);
          break;
        }
        if (event.actor === null) {
          diagnostics.add("missing_actor", event.key);
          break;
        }
        if (event.actor.kind === "bot") {
          diagnostics.add("bot_actor", event.key);
          break;
        }
        if (!m.authorIsPlayer || !event.repo?.ownedByPlayer || !creditable(event, config)) break;
        releases.push({ event, timing });
        break;
      }
      default:
        break;
    }
  }

  candidates.push(...qualifyReleases(releases, events, commits, ctx));
  allocateCapped(candidates, ctx);
}

function closedNotPlannedQuickly(issue: NormalizedEvent<"issue">, hours: number): boolean {
  const m = issue.metadata;
  if (m.stateReason?.toUpperCase() !== "NOT_PLANNED") return false;
  const created = parseInstant(m.createdAt);
  const closed = parseInstant(m.closedAt);
  return created !== null && closed !== null && closed - created < hours * 3_600_000;
}

/**
 * Release rules (economy-balancing §2, GDD §1.4): ≥ 3 qualifying commits in the repo since
 * the previous published release, and at most one rewarded release per repo per 7 days.
 */
function qualifyReleases(
  releases: Array<{ event: NormalizedEvent<"release">; timing: Timing }>,
  allEvents: readonly AnyEvent[],
  commits: readonly QualifiedCommit[],
  ctx: ExpContext,
): Candidate[] {
  const x = ctx.rules.exp;
  const published = new Map<string, number[]>();
  for (const e of allEvents) {
    if (e.type !== "release" || e.metadata.isDraft || e.repo === null) continue;
    const ms = parseInstant(e.metadata.publishedAt);
    if (ms === null) continue;
    const list = published.get(e.repo.id) ?? [];
    list.push(ms);
    published.set(e.repo.id, list);
  }
  const commitTimes = new Map<string, number[]>();
  for (const c of commits) {
    const repo = c.event.repo?.id ?? "-";
    const list = commitTimes.get(repo) ?? [];
    list.push(c.timing.eventMs);
    commitTimes.set(repo, list);
  }
  const rewarded = new Map<string, number[]>();
  for (const e of ctx.ledger.entries) {
    if (
      e.rule === "exp.release" &&
      typeof e.meta?.repo === "string" &&
      typeof e.meta.publishedMs === "number"
    ) {
      const list = rewarded.get(e.meta.repo) ?? [];
      list.push(e.meta.publishedMs);
      rewarded.set(e.meta.repo, list);
    }
  }
  const out: Candidate[] = [];
  releases.sort(
    (a, b) => a.timing.eventMs - b.timing.eventMs || (a.event.key < b.event.key ? -1 : 1),
  );
  for (const { event, timing } of releases) {
    const id = `exp.release|${event.key}`;
    if (ctx.ledger.has(id)) continue;
    const repo = event.repo?.id ?? "-";
    const at = timing.eventMs;
    const previous = Math.max(-Infinity, ...(published.get(repo) ?? []).filter((t) => t < at));
    const since = (commitTimes.get(repo) ?? []).filter((t) => t > previous && t <= at).length;
    if (since < x.releaseMinCommits) {
      ctx.diagnostics.add("release_too_few_commits", event.key);
      continue;
    }
    const cooldownMs = x.releaseRepoCooldownDays * 86_400_000;
    if ((rewarded.get(repo) ?? []).some((t) => Math.abs(at - t) < cooldownMs)) {
      ctx.diagnostics.add("release_cooldown", event.key);
      continue;
    }
    rewarded.set(repo, [...(rewarded.get(repo) ?? []), at]);
    out.push({
      id,
      rule: "exp.release",
      base: event.metadata.isPrerelease ? x.releasePre : x.releaseFull,
      capGroup: "release",
      cap: x.releaseDailyCap,
      timing,
      subject: ref(event),
      meta: { repo, publishedMs: at, prerelease: event.metadata.isPrerelease },
    });
  }
  return out;
}

/**
 * Private aggregate EXP (economy-balancing §2): 4 EXP per new private contribution, 200 per
 * ISO week. The collector reports a cumulative count per contribution window; increases
 * are awarded once per cumulative level, so the same contributions are never paid twice.
 * Decreases (e.g. the profile setting was turned off) are ignored; nothing is revoked.
 */
export function allocatePrivateExp(events: readonly AnyEvent[], ctx: ExpContext): void {
  const x = ctx.rules.exp;
  const groups = new Map<string, NormalizedEvent<"private_contribution_count">[]>();
  for (const e of events) {
    if (e.type !== "private_contribution_count") continue;
    const list = groups.get(e.metadata.windowFrom) ?? [];
    list.push(e);
    groups.set(e.metadata.windowFrom, list);
  }
  const weekUsed = new Map<string, number>();
  const counted = new Map<string, number>();
  for (const e of ctx.ledger.entries) {
    if (e.rule !== "exp.private") continue;
    if (e.week) weekUsed.set(e.week, (weekUsed.get(e.week) ?? 0) + e.amount);
    const from = String(e.meta?.windowFrom ?? "");
    counted.set(from, Math.max(counted.get(from) ?? 0, Number(e.meta?.cumulative ?? 0)));
  }
  for (const from of [...groups.keys()].sort()) {
    const list = (groups.get(from) ?? []).sort((a, b) =>
      a.metadata.windowTo < b.metadata.windowTo ? -1 : 1,
    );
    for (const e of list) {
      const cumulative = e.metadata.restrictedContributionsCount;
      const already = counted.get(from) ?? 0;
      if (cumulative <= already) continue;
      const ms = parseInstant(e.metadata.windowTo);
      if (ms === null) {
        ctx.diagnostics.add("invalid_timestamp", e.key);
        continue;
      }
      const day = dayOf(ms, ctx.config.timezone);
      const week = isoWeek(day);
      const delta = cumulative - already;
      const base = delta * x.privatePerContribution;
      const amount = Math.min(base, Math.max(0, x.privateWeeklyCap - (weekUsed.get(week) ?? 0)));
      weekUsed.set(week, (weekUsed.get(week) ?? 0) + amount);
      counted.set(from, cumulative);
      const season = seasonOf(day, ctx.config.season1Start);
      const entry: LedgerEntry = {
        id: `exp.private|${from}|${cumulative}`,
        kind: "exp",
        rule: "exp.private",
        ruleVersion: ctx.rules.version,
        subject: [ref(e)],
        amount,
        eventDay: day,
        effectiveDay: day,
        week,
        createdAt: ctx.runAt,
        meta: { windowFrom: from, cumulative, contributions: delta },
      };
      if (amount < base) entry.reason = "weekly_cap";
      if (season) entry.season = season.id;
      ctx.ledger.add(entry);
    }
  }
}
