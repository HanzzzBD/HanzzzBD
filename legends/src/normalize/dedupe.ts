import { canonicalJson, sha256Hex } from "../core/hash.ts";
import type { AnyEvent, NormalizedEvent } from "./event.ts";

/**
 * Duplicate-prevention primitives (architecture ADR-0006).
 *
 * 1. Keys: the same GitHub object always yields the same key.
 * 2. In-batch dedupe: several endpoints can return the same object in one run.
 * 3. Cross-run merge: known keys keep `firstSeenAt`; changed facts become a new `rev`.
 * 4. Fingerprints: rebased or cherry-picked commits (new SHA, same content) are detected.
 */

/** Hash of the facts that define an observation (excludes rev, firstSeenAt and provenance). */
export function contentHash(event: AnyEvent): string {
  return sha256Hex(
    canonicalJson({
      type: event.type,
      repo: event.repo,
      actor: event.actor,
      occurredAt: event.occurredAt,
      metadata: event.metadata,
      verification: event.verification,
    }),
  );
}

/**
 * Collapses events with the same key from one run. When observations differ, `combine`
 * decides; the default prefers the more complete verification, then the smaller content
 * hash, so the outcome never depends on input order.
 */
export function dedupeBatch(
  events: readonly AnyEvent[],
  combine: (a: AnyEvent, b: AnyEvent) => AnyEvent = preferMoreComplete,
): { events: AnyEvent[]; duplicates: number; conflicts: number } {
  const byKey = new Map<string, AnyEvent>();
  let duplicates = 0;
  let conflicts = 0;
  const ordered = [...events].sort(
    (a, b) => compare(a.key, b.key) || compare(contentHash(a), contentHash(b)),
  );
  for (const event of ordered) {
    const existing = byKey.get(event.key);
    if (!existing) {
      byKey.set(event.key, event);
      continue;
    }
    duplicates++;
    if (contentHash(existing) !== contentHash(event)) {
      conflicts++;
      byKey.set(event.key, combine(existing, event));
    } else {
      byKey.set(event.key, mergeProvenance(existing, event));
    }
  }
  return { events: [...byKey.values()], duplicates, conflicts };
}

const RANK = { verified: 2, partial: 1, unverifiable: 0 } as const;

export function preferMoreComplete(a: AnyEvent, b: AnyEvent): AnyEvent {
  const ra = RANK[a.verification.status];
  const rb = RANK[b.verification.status];
  const winner =
    ra !== rb ? (ra > rb ? a : b) : compare(contentHash(a), contentHash(b)) <= 0 ? a : b;
  return mergeProvenance(winner, winner === a ? b : a);
}

function mergeProvenance(keep: AnyEvent, other: AnyEvent): AnyEvent {
  const sources = [...new Set([...keep.provenance.sources, ...other.provenance.sources])].sort();
  return { ...keep, provenance: { ...keep.provenance, sources } } as AnyEvent;
}

export interface MergeResult {
  /** Events to persist: new keys (rev 1) and revisions of known keys. */
  changed: AnyEvent[];
  added: number;
  revised: number;
  unchanged: number;
}

/**
 * Merges this run's observations with the latest known revision of each key.
 * `firstSeenAt` for a new key is `runAt`, or the event time when `backfill` is true
 * (PRD §10: history observed at install time counts at its own date).
 */
export function mergeObservations(
  known: ReadonlyMap<string, AnyEvent>,
  incoming: readonly AnyEvent[],
  runAt: string,
  options: { backfill?: boolean } = {},
): MergeResult {
  const changed: AnyEvent[] = [];
  let added = 0;
  let revised = 0;
  let unchanged = 0;
  for (const event of [...incoming].sort((a, b) => compare(a.key, b.key))) {
    const previous = known.get(event.key);
    if (!previous) {
      added++;
      const firstSeenAt = options.backfill ? event.occurredAt : runAt;
      changed.push({ ...event, rev: 1, firstSeenAt } as AnyEvent);
      continue;
    }
    if (contentHash(previous) === contentHash(event)) {
      unchanged++;
      continue;
    }
    revised++;
    changed.push({
      ...event,
      rev: previous.rev + 1,
      firstSeenAt: previous.firstSeenAt,
    } as AnyEvent);
  }
  return { changed, added, revised, unchanged };
}

/** Latest revision per key from a stored list (highest rev wins). */
export function latestByKey(events: Iterable<AnyEvent>): Map<string, AnyEvent> {
  const out = new Map<string, AnyEvent>();
  for (const event of events) {
    const current = out.get(event.key);
    if (!current || event.rev > current.rev) out.set(event.key, event);
  }
  return out;
}

/**
 * Finds commits that repeat an earlier commit's content in the same repo within
 * `windowDays` (GDD §1.5). Returns duplicateKey → originalKey. The original is the
 * earliest by (occurredAt, key), so the result is order-independent.
 */
export function findFingerprintDuplicates(
  commits: readonly NormalizedEvent<"commit">[],
  windowDays = 30,
): Map<string, string> {
  const windowMs = windowDays * 86_400_000;
  const groups = new Map<string, NormalizedEvent<"commit">[]>();
  for (const commit of commits) {
    const group = `${commit.repo?.id ?? "-"}|${commit.metadata.fingerprint}`;
    const list = groups.get(group) ?? [];
    list.push(commit);
    groups.set(group, list);
  }
  const duplicates = new Map<string, string>();
  for (const list of groups.values()) {
    list.sort((a, b) => compare(a.occurredAt, b.occurredAt) || compare(a.key, b.key));
    let anchor = list[0];
    for (const commit of list.slice(1)) {
      if (!anchor) break;
      const delta = Date.parse(commit.occurredAt) - Date.parse(anchor.occurredAt);
      if (delta <= windowMs) duplicates.set(commit.key, anchor.key);
      else anchor = commit;
    }
  }
  return duplicates;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
