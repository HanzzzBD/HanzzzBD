import { canonicalJson, sha256Hex } from "../core/hash.ts";
import { findFingerprintDuplicates } from "../normalize/dedupe.ts";
import type { AnyEvent, NormalizedEvent, RepoRef } from "../normalize/event.ts";
import type { Ruleset } from "./rules.ts";
import { dayOf, daysBetween, isoWeek, minuteOfDay, parseInstant } from "./time.ts";

export interface EngineConfig {
  /** IANA timezone for player days (PD-05: Asia/Jakarta). */
  timezone: string;
  /** First day of Season 1 (the install quarter, PRD §10). */
  season1Start: string;
  /** Repos declared as automation (repo id "gh:…"/"p:…" or owner/name). Reduce credit only. */
  automationRepos: readonly string[];
  /** Repos excluded from credit. Reduce credit only. */
  excludeRepos: readonly string[];
}

/** Aggregated, privacy-safe diagnostics (codes + counts + a few example keys). */
export class Diagnostics {
  readonly #items = new Map<string, { count: number; examples: Set<string> }>();

  add(code: string, key?: string): void {
    const item = this.#items.get(code) ?? { count: 0, examples: new Set<string>() };
    item.count++;
    if (key !== undefined && item.examples.size < 5) item.examples.add(key);
    this.#items.set(code, item);
  }

  summary(): Array<{ code: string; count: number; examples: string[] }> {
    return [...this.#items.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([code, { count, examples }]) => ({ code, count, examples: [...examples].sort() }));
  }
}

export interface Timing {
  eventMs: number;
  eventDay: string;
  effectiveMs: number;
  effectiveDay: string;
  week: string;
}

/**
 * Validates an event time and derives its days (PRD §4.4):
 *   effective = max(eventTime, firstSeenAt − 48 h)
 * Invalid: unparseable, before 2008, or more than 24 h after `observedByMs`.
 *  - Commits (immutable, author-dated): `observedByMs` = firstSeenAt, so a future-dated
 *    (forged) author date stays invalid permanently.
 *  - Mutable facts with server-set times (mergedAt, closedAt, publishedAt, submittedAt) can be
 *    observed in a later revision than the key's firstSeenAt: callers pass the run time.
 */
export function timingOf(
  occurredAt: string | null | undefined,
  firstSeenAt: string,
  rules: Ruleset,
  timezone: string,
  observedByMs?: number,
): Timing | null {
  const eventMs = parseInstant(occurredAt);
  const seenMs = parseInstant(firstSeenAt);
  const earliest = parseInstant(rules.time.earliestValidInstant) ?? 0;
  if (eventMs === null || seenMs === null || eventMs < earliest || seenMs < earliest) return null;
  const limit = Math.max(seenMs, observedByMs ?? seenMs);
  if (eventMs > limit + rules.time.maxAheadOfFirstSeenHours * 3_600_000) return null;
  const effectiveMs = Math.max(eventMs, seenMs - rules.time.effectiveGraceHours * 3_600_000);
  const effectiveDay = dayOf(effectiveMs, timezone);
  return {
    eventMs,
    eventDay: dayOf(eventMs, timezone),
    effectiveMs,
    effectiveDay,
    week: isoWeek(effectiveDay),
  };
}

export function repoListed(repo: RepoRef | null, list: readonly string[]): boolean {
  if (repo === null || list.length === 0) return false;
  const name = repo.fullName?.toLowerCase();
  return list.some(
    (entry) => entry === repo.id || (name !== undefined && entry.toLowerCase() === name),
  );
}

/**
 * Keeps the latest revision of each key. Ties (same key and rev, different content) are
 * resolved by the smaller content hash, so the outcome never depends on input order.
 * Events never merged into state (rev < 1) are rejected.
 */
export function prepareEvents(
  events: readonly AnyEvent[],
  diagnostics: Diagnostics,
): Map<string, AnyEvent> {
  const out = new Map<string, AnyEvent>();
  const hashes = new Map<string, string>();
  for (const event of events) {
    if (!Number.isInteger(event.rev) || event.rev < 1) {
      diagnostics.add("unmerged_event", event.key);
      continue;
    }
    const current = out.get(event.key);
    const hash = sha256Hex(canonicalJson(event));
    if (current) {
      diagnostics.add("duplicate_event_input", event.key);
      if (event.rev < current.rev) continue;
      if (event.rev === current.rev && hash >= (hashes.get(event.key) ?? "")) continue;
    }
    out.set(event.key, event);
    hashes.set(event.key, hash);
  }
  return out;
}

export interface QualifiedCommit {
  event: NormalizedEvent<"commit">;
  timing: Timing;
  size: number;
}

export interface AutomationFlag {
  repo: string;
  day: string;
  rule: "clockwork" | "micro_flood";
}

const SHA = /^[0-9a-f]{40}$/;

/**
 * Commit qualification (PRD §4.1, GDD §1.2, §1.5, §1.6). Order of checks:
 * timestamp → attribution → bot → fork/excluded/declared automation → merge → empty
 * → duplicate SHA across repos → duplicate fingerprint (30 days, same repo) → automation flag.
 */
export function qualifyCommits(
  events: Iterable<AnyEvent>,
  config: EngineConfig,
  rules: Ruleset,
  diagnostics: Diagnostics,
): { qualifying: QualifiedCommit[]; flags: AutomationFlag[] } {
  const candidates: QualifiedCommit[] = [];
  for (const event of events) {
    if (event.type !== "commit") continue;
    const timing = timingOf(event.occurredAt, event.firstSeenAt, rules, config.timezone);
    const m = event.metadata;
    let reason: string | null = null;
    if (timing === null) reason = "invalid_timestamp";
    else if (event.actor === null || m === undefined) reason = "missing_actor";
    else if (event.actor.kind === "bot") reason = "bot_actor";
    else if (!m.playerIsPrimaryAuthor || !event.actor.isPlayer) reason = "not_player_author";
    else if (event.repo === null) reason = "missing_repo";
    else if (event.repo.isFork) reason = "fork_repo";
    else if (repoListed(event.repo, config.excludeRepos)) reason = "excluded_repo";
    else if (repoListed(event.repo, config.automationRepos)) reason = "automation_declared";
    else if (m.parentCount !== 1) reason = "merge_commit";
    else if (m.additions + m.deletions <= 0) reason = "empty_commit";
    if (reason !== null || timing === null) {
      diagnostics.add(reason ?? "invalid_timestamp", event.key);
      continue;
    }
    candidates.push({ event, timing, size: m.additions + m.deletions });
  }
  candidates.sort((a, b) => a.timing.eventMs - b.timing.eventMs || cmp(a.event.key, b.event.key));

  // Same public SHA in several repos (mirrors, re-pushes): only the earliest counts.
  const seenSha = new Set<string>();
  const unique: QualifiedCommit[] = [];
  for (const c of candidates) {
    const sha = c.event.metadata.sha;
    if (c.event.repo?.visibility === "public" && SHA.test(sha)) {
      if (seenSha.has(sha)) {
        diagnostics.add("duplicate_sha", c.event.key);
        continue;
      }
      seenSha.add(sha);
    }
    unique.push(c);
  }

  const dupes = findFingerprintDuplicates(
    unique.map((c) => c.event),
    rules.duplicates.fingerprintWindowDays,
  );
  const deduped = unique.filter((c) => {
    if (!dupes.has(c.event.key)) return true;
    diagnostics.add("duplicate_fingerprint", c.event.key);
    return false;
  });

  const flags = automationFlags(deduped, config.timezone, rules);
  const flagged = new Map(flags.map((f) => [`${f.repo}|${f.day}`, f.rule]));
  const qualifying = deduped.filter((c) => {
    const rule = flagged.get(`${c.event.repo?.id}|${c.timing.eventDay}`);
    if (rule === undefined) return true;
    diagnostics.add(`automation_${rule}`, c.event.key);
    return false;
  });
  return { qualifying, flags };
}

/**
 * Automation detection per (repo, day) over the 30-day window ending that day (GDD §1.6).
 * Evaluated per day so backfill and incremental runs agree; a flag affects only commits
 * of flagged days and never revokes earlier awards.
 *
 * Interpretations (documented in docs/implementation/game-engine.md §6):
 *  - Clockwork: the ±2-minute window is chosen to maximise the number of days; commits whose
 *    message matched an automation pattern count as inside the window.
 *  - Micro-flood: a "cap hit" day is a day with ≥ 10 qualifying commits in that repo (the
 *    count that reaches the daily commit EXP maximum).
 */
export function automationFlags(
  commits: readonly QualifiedCommit[],
  timezone: string,
  rules: Ruleset,
): AutomationFlag[] {
  const a = rules.automation;
  const byRepo = new Map<string, QualifiedCommit[]>();
  for (const c of commits) {
    const repo = c.event.repo?.id ?? "-";
    const list = byRepo.get(repo) ?? [];
    list.push(c);
    byRepo.set(repo, list);
  }
  const flags: AutomationFlag[] = [];
  for (const repo of [...byRepo.keys()].sort()) {
    const list = byRepo.get(repo) ?? [];
    const days = [...new Set(list.map((c) => c.timing.eventDay))].sort();
    const origin = days[0] ?? "1970-01-01";
    const enriched = list.map((c) => ({
      dayIndex: daysBetween(origin, c.timing.eventDay),
      minute: minuteOfDay(c.timing.eventMs, timezone),
      pattern: c.event.metadata.messagePatternHit,
      size: c.size,
    }));
    for (const day of days) {
      const end = daysBetween(origin, day);
      const start = end - (a.windowDays - 1);
      const windowCommits = enriched.filter((c) => c.dayIndex >= start && c.dayIndex <= end);
      if (clockwork(windowCommits, start, rules)) flags.push({ repo, day, rule: "clockwork" });
      else if (microFlood(windowCommits, rules)) flags.push({ repo, day, rule: "micro_flood" });
    }
  }
  return flags;
}

interface WindowCommit {
  dayIndex: number;
  minute: number;
  pattern: boolean;
  size: number;
}

function popcount(n: number): number {
  let count = 0;
  for (let v = n >>> 0; v !== 0; v &= v - 1) count++;
  return count;
}

function clockwork(commits: readonly WindowCommit[], windowStart: number, rules: Ruleset): boolean {
  const a = rules.automation;
  if (commits.length === 0) return false;
  const masks = new Array<number>(1440).fill(0);
  const counts = new Array<number>(1440).fill(0);
  let patternMask = 0;
  let patternCount = 0;
  for (const c of commits) {
    const bit = 1 << (c.dayIndex - windowStart); // window ≤ 30 days → fits in 32 bits
    if (c.pattern) {
      patternMask |= bit;
      patternCount++;
    } else {
      masks[c.minute] = (masks[c.minute] ?? 0) | bit;
      counts[c.minute] = (counts[c.minute] ?? 0) + 1;
    }
  }
  let bestDays = popcount(patternMask);
  let bestCount = patternCount;
  for (let center = 0; center < 1440; center++) {
    let mask = patternMask;
    let count = patternCount;
    for (let d = -a.clockworkToleranceMinutes; d <= a.clockworkToleranceMinutes; d++) {
      const m = (center + d + 1440) % 1440;
      mask |= masks[m] ?? 0;
      count += counts[m] ?? 0;
    }
    const days = popcount(mask);
    if (days > bestDays || (days === bestDays && count > bestCount)) {
      bestDays = days;
      bestCount = count;
    }
  }
  return (
    bestDays >= a.clockworkMinDays && bestCount * 100 >= a.clockworkMinSharePercent * commits.length
  );
}

function microFlood(commits: readonly WindowCommit[], rules: Ruleset): boolean {
  const a = rules.automation;
  if (commits.length === 0) return false;
  const perDay = new Map<number, number>();
  for (const c of commits) perDay.set(c.dayIndex, (perDay.get(c.dayIndex) ?? 0) + 1);
  let capDays = 0;
  for (const n of perDay.values()) if (n >= a.microFloodDailyCommits) capDays++;
  const sizes = commits.map((c) => c.size).sort((x, y) => x - y);
  const mid = Math.floor(sizes.length / 2);
  const median =
    sizes.length % 2 === 1 ? (sizes[mid] ?? 0) : ((sizes[mid - 1] ?? 0) + (sizes[mid] ?? 0)) / 2;
  return (
    capDays * 100 >= a.microFloodMinSharePercent * perDay.size &&
    median <= a.microFloodMaxMedianLines
  );
}

/** Human-account rule (GDD §1.4): a User, not a bot, not the player, created ≥ 30 days before the event. */
export function isEstablishedHuman(
  account:
    | { id: number | null; kind?: string; isPlayer?: boolean; accountCreatedAt?: string | null }
    | null
    | undefined,
  eventMs: number,
  rules: Ruleset,
): boolean {
  if (!account || account.id === null || account.isPlayer) return false;
  if (account.kind !== undefined && account.kind !== "user") return false;
  const created = parseInstant(account.accountCreatedAt ?? null);
  if (created === null) return false;
  return eventMs - created >= rules.objectives.humanMinAccountAgeDays * 86_400_000;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
