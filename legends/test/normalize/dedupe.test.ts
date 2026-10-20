import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dedupeBatch,
  findFingerprintDuplicates,
  latestByKey,
  mergeObservations,
} from "../../src/normalize/dedupe.ts";
import type { AnyEvent, NormalizedEvent } from "../../src/normalize/event.ts";

const RUN_1 = "2026-10-19T17:17:00Z";
const RUN_2 = "2026-10-20T17:17:00Z";

function day(date: string, count: number, status: "verified" | "partial" = "verified"): AnyEvent {
  return {
    key: `cal:${date}`,
    type: "contribution_day",
    rev: 0,
    repo: null,
    actor: null,
    occurredAt: `${date}T00:00:00Z`,
    firstSeenAt: "1970-01-01T00:00:00Z",
    metadata: { date, count },
    provenance: { sources: ["calendar"], api: "graphql", collectorVersion: "1" },
    verification: { status, notes: status === "partial" ? ["x"] : [] },
  };
}

function commit(
  key: string,
  fingerprint: string,
  occurredAt: string,
  repo = "gh:1",
): NormalizedEvent<"commit"> {
  return {
    key,
    type: "commit",
    rev: 1,
    occurredAt,
    firstSeenAt: occurredAt,
    repo: { id: repo, visibility: "public", ownedByPlayer: true, isFork: false, isArchived: false },
    actor: null,
    metadata: {
      sha: key,
      parentCount: 1,
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      authoredAt: occurredAt,
      committedAt: occurredAt,
      onDefaultBranch: true,
      playerIsPrimaryAuthor: true,
      coAuthorIds: [],
      fingerprint,
      messagePatternHit: false,
    },
    provenance: { sources: ["commits"], api: "graphql", collectorVersion: "1" },
    verification: { status: "verified", notes: [] },
  };
}

describe("dedupeBatch", () => {
  it("collapses identical observations and merges their sources", () => {
    const a = day("2026-10-15", 3);
    const b = {
      ...day("2026-10-15", 3),
      provenance: { sources: ["issues"], api: "graphql", collectorVersion: "1" },
    } as AnyEvent;
    const result = dedupeBatch([a, b]);
    expect(result.events).toHaveLength(1);
    expect(result.duplicates).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(result.events[0]?.provenance.sources).toEqual(["calendar", "issues"]);
  });

  it("resolves conflicts toward the more complete observation", () => {
    const result = dedupeBatch([day("2026-10-15", 9, "partial"), day("2026-10-15", 3, "verified")]);
    expect(result.conflicts).toBe(1);
    expect(result.events[0]?.metadata).toEqual({ date: "2026-10-15", count: 3 });
  });

  it("is independent of input order (property)", () => {
    const spec = fc.array(
      fc.tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 5 }), fc.boolean()),
      {
        maxLength: 30,
      },
    );
    const withPermutation = spec.chain((specs) =>
      fc.tuple(
        fc.constant(specs),
        fc.shuffledSubarray(specs, { minLength: specs.length, maxLength: specs.length }),
      ),
    );
    fc.assert(
      fc.property(withPermutation, ([specs, permuted]) => {
        const toEvents = (list: typeof specs) =>
          list.map(([d, c, v]) => day(`2026-10-0${d}`, c, v ? "verified" : "partial"));
        const a = dedupeBatch(toEvents(specs))
          .events.map((e) => JSON.stringify(e))
          .sort();
        const b = dedupeBatch(toEvents(permuted))
          .events.map((e) => JSON.stringify(e))
          .sort();
        expect(a).toEqual(b);
      }),
    );
  });
});

describe("mergeObservations", () => {
  it("assigns rev 1 and firstSeenAt = runAt to new keys", () => {
    const result = mergeObservations(new Map(), [day("2026-10-15", 3)], RUN_1);
    expect(result).toMatchObject({ added: 1, revised: 0, unchanged: 0 });
    expect(result.changed[0]).toMatchObject({ rev: 1, firstSeenAt: RUN_1 });
  });

  it("uses the event time as firstSeenAt during backfill", () => {
    const result = mergeObservations(new Map(), [day("2026-10-15", 3)], RUN_1, { backfill: true });
    expect(result.changed[0]?.firstSeenAt).toBe("2026-10-15T00:00:00Z");
  });

  it("is idempotent: re-observing the same facts changes nothing", () => {
    const first = mergeObservations(new Map(), [day("2026-10-15", 3)], RUN_1);
    const known = latestByKey(first.changed);
    const second = mergeObservations(known, [day("2026-10-15", 3)], RUN_2);
    expect(second).toMatchObject({ changed: [], added: 0, revised: 0, unchanged: 1 });
  });

  it("records changed facts as a new revision and keeps firstSeenAt", () => {
    const known = latestByKey(mergeObservations(new Map(), [day("2026-10-15", 3)], RUN_1).changed);
    const second = mergeObservations(known, [day("2026-10-15", 5)], RUN_2);
    expect(second.revised).toBe(1);
    expect(second.changed[0]).toMatchObject({ rev: 2, firstSeenAt: RUN_1, metadata: { count: 5 } });
  });

  it("never re-adds known keys across repeated runs (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 28 }), { maxLength: 40 }), (days) => {
        const events = dedupeBatch(
          days.map((d) => day(`2026-10-${String(d).padStart(2, "0")}`, d)),
        ).events;
        const once = mergeObservations(new Map(), events, RUN_1);
        const twice = mergeObservations(latestByKey(once.changed), events, RUN_2);
        expect(once.added).toBe(events.length);
        expect(twice.changed).toHaveLength(0);
      }),
    );
  });
});

describe("findFingerprintDuplicates", () => {
  it("links later copies to the earliest commit within the window, per repo", () => {
    const result = findFingerprintDuplicates([
      commit("c2", "f1", "2026-10-10T00:00:00Z"),
      commit("c1", "f1", "2026-10-01T00:00:00Z"),
      commit("c3", "f1", "2026-12-15T00:00:00Z"),
      commit("c4", "f1", "2026-10-02T00:00:00Z", "gh:2"),
      commit("c5", "f2", "2026-10-02T00:00:00Z"),
    ]);
    expect(Object.fromEntries(result)).toEqual({ c2: "c1" });
  });
});
