import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/core/hash.ts";
import { assertInvariants, runEngine } from "../../src/engine/engine.ts";
import type { LedgerEntry } from "../../src/engine/ledger.ts";
import { RULESET_V1 } from "../../src/engine/rules.ts";
import { addDays } from "../../src/engine/time.ts";
import {
  type AnyEvent,
  CONFIG,
  commit,
  EXT,
  HUMAN,
  issue,
  OWN,
  OWN2,
  pr,
  resetCounter,
  review,
  wib,
} from "../helpers/events.ts";

const RUN = "2026-11-30T00:00:00Z";
const run = (events: readonly AnyEvent[], ledger: readonly LedgerEntry[] = [], runAt = RUN) =>
  runEngine({ config: CONFIG, events, ledger, runAt, closureAllowed: true });
const amounts = (ledger: readonly LedgerEntry[]) =>
  Object.fromEntries(ledger.map((e) => [e.id, e.amount]));

beforeEach(resetCounter);

/** Arbitrary activity across October–November 2026 (players day, minute, kind, size). */
const activity = fc.array(
  fc.record({
    day: fc.integer({ min: 0, max: 55 }),
    minute: fc.integer({ min: 0, max: 1439 }),
    kind: fc.constantFrom(
      "commit",
      "commit",
      "commit",
      "tiny",
      "empty",
      "merge",
      "pr_self",
      "pr_ext",
      "review",
      "issue_fix",
    ),
    repo: fc.constantFrom(0, 1),
    lag: fc.constantFrom(0, 0, 0, 1, 4),
  }),
  { maxLength: 120 },
);

function materialise(
  specs: Array<{ day: number; minute: number; kind: string; repo: number; lag: number }>,
): AnyEvent[] {
  resetCounter();
  return specs.map((s, i) => {
    const day = addDays("2026-10-01", s.day);
    const at = wib(
      day,
      `${String(Math.floor(s.minute / 60)).padStart(2, "0")}:${String(s.minute % 60).padStart(2, "0")}`,
    );
    const firstSeenAt = new Date(Date.parse(at) + s.lag * 86_400_000)
      .toISOString()
      .replace(".000Z", "Z");
    const repo = s.repo === 0 ? OWN : OWN2;
    switch (s.kind) {
      case "tiny":
        return commit({ at, repo, adds: 1, dels: 0, firstSeenAt });
      case "empty":
        return commit({ at, repo, adds: 0, dels: 0, firstSeenAt });
      case "merge":
        return commit({ at, repo, parents: 2, firstSeenAt });
      case "pr_self":
        return pr({ id: `P${i}`, mergedAt: at, repo, firstSeenAt });
      case "pr_ext":
        return pr({ id: `P${i}`, mergedAt: at, repo: EXT, firstSeenAt });
      case "review":
        return review({ at, id: `R${i}` });
      case "issue_fix":
        return issue({
          id: `I${i}`,
          createdAt: at,
          closedAt: at,
          author: HUMAN(3000 + (i % 4)),
          firstSeenAt,
        });
      default:
        return commit({ at, repo, firstSeenAt });
    }
  });
}

describe("determinism and idempotency", () => {
  it("produces byte-identical output for identical input", () => {
    fc.assert(
      fc.property(activity, (specs) => {
        const events = materialise(specs);
        expect(canonicalJson(run(events))).toBe(canonicalJson(run(events)));
      }),
      { numRuns: 40 },
    );
  });

  it("is independent of input event order", () => {
    fc.assert(
      fc.property(
        activity.chain((specs) =>
          fc.tuple(
            fc.constant(specs),
            fc.shuffledSubarray(
              specs.map((_, i) => i),
              { minLength: specs.length, maxLength: specs.length },
            ),
          ),
        ),
        ([specs, order]) => {
          const events = materialise(specs);
          const shuffled = order.map((i) => events[i] as AnyEvent);
          expect(canonicalJson(run(shuffled).newEntries)).toBe(
            canonicalJson(run(events).newEntries),
          );
        },
      ),
      { numRuns: 40 },
    );
  });

  it("adds nothing when rerun with its own ledger (no double rewards)", () => {
    fc.assert(
      fc.property(activity, (specs) => {
        const events = materialise(specs);
        const first = run(events);
        const second = run(events, first.ledger);
        expect(second.newEntries).toEqual([]);
        expect(second.progress).toEqual(first.progress);
      }),
      { numRuns: 40 },
    );
  });

  it("keeps the ledger append-only: earlier entries are never modified", () => {
    fc.assert(
      fc.property(activity, fc.integer({ min: 1, max: 119 }), (specs, cut) => {
        const events = materialise(specs);
        const first = run(events.slice(0, cut));
        const second = run(events, first.ledger);
        expect(second.ledger.slice(0, first.ledger.length)).toEqual(first.ledger);
      }),
      { numRuns: 30 },
    );
  });

  it("matches a single batch run when events arrive day by day in order", () => {
    resetCounter();
    const events: AnyEvent[] = [];
    for (let d = 0; d < 21; d++) {
      const day = addDays("2026-10-05", d);
      for (let k = 0; k < 4; k++)
        events.push(
          commit({
            at: wib(
              day,
              `${String(9 + ((d + k) % 9)).padStart(2, "0")}:${String((d * 11 + k * 17) % 60).padStart(2, "0")}`,
            ),
          }),
        );
      if (d % 5 === 0) events.push(pr({ id: `D${d}`, mergedAt: wib(day, "20:00"), repo: EXT }));
    }
    const batch = run(events, [], "2026-10-30T00:00:00Z");
    let ledger: LedgerEntry[] = [];
    for (let d = 0; d < 21; d++) {
      const end = addDays("2026-10-05", d + 1);
      const seen = events.filter((e) => e.occurredAt < wib(end, "00:00"));
      ledger = run(seen, ledger, wib(end, "00:17")).ledger;
    }
    ledger = run(events, ledger, "2026-10-30T00:00:00Z").ledger;
    const byId = (l: readonly LedgerEntry[]) =>
      Object.fromEntries(Object.entries(amounts(l)).sort());
    expect(byId(ledger)).toEqual(byId(batch.ledger));
  });
});

describe("invariants under random activity", () => {
  it("never breaks caps or balances", () => {
    fc.assert(
      fc.property(activity, (specs) => {
        const out = run(materialise(specs));
        assertInvariants(out.ledger, RULESET_V1);
        const exp = out.ledger.filter((e) => e.kind === "exp").reduce((s, e) => s + e.amount, 0);
        expect(out.progress.lifetime.exp).toBe(exp);
        expect(out.progress.lifetime.bp).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 60 },
    );
  });

  it("never lets activity without contested objectives rank above Warden I (anti-manipulation)", () => {
    const spam = fc.array(
      fc.record({
        day: fc.integer({ min: 0, max: 60 }),
        n: fc.integer({ min: 3, max: 60 }),
        selfPrs: fc.integer({ min: 0, max: 3 }),
      }),
      { maxLength: 60 },
    );
    fc.assert(
      fc.property(spam, (days) => {
        resetCounter();
        const events: AnyEvent[] = [];
        days.forEach((d, i) => {
          const day = addDays("2026-10-01", d.day);
          for (let k = 0; k < d.n; k++)
            events.push(
              commit({
                at: wib(
                  day,
                  `${String(k % 24).padStart(2, "0")}:${String((i + k) % 60).padStart(2, "0")}`,
                ),
                adds: 1 + (k % 5),
              }),
            );
          for (let p = 0; p < d.selfPrs; p++)
            events.push(pr({ id: `S${i}-${p}`, mergedAt: wib(day, `2${p}:00`) }));
        });
        const out = run(events, [], "2026-12-30T00:00:00Z");
        expect(out.progress.season?.rank.tierIndex ?? 0).toBeLessThanOrEqual(3);
        expect(out.ledger.filter((e) => e.kind === "trial")).toEqual([]);
      }),
      { numRuns: 40 },
    );
  });

  it("keeps EXP and level monotonic as more activity arrives", () => {
    fc.assert(
      fc.property(activity, (specs) => {
        const events = materialise(specs);
        let ledger: LedgerEntry[] = [];
        let lastExp = 0;
        let lastLevel = 1;
        for (let cut = 0; cut <= events.length; cut += 20) {
          const out = run(events.slice(0, cut), ledger);
          ledger = out.ledger;
          expect(out.progress.lifetime.exp).toBeGreaterThanOrEqual(lastExp);
          expect(out.progress.lifetime.level).toBeGreaterThanOrEqual(lastLevel);
          lastExp = out.progress.lifetime.exp;
          lastLevel = out.progress.lifetime.level;
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe("input validation", () => {
  it("rejects an invalid run time, timezone or season start", () => {
    expect(() =>
      runEngine({
        config: CONFIG,
        events: [],
        ledger: [],
        runAt: "yesterday",
        closureAllowed: true,
      }),
    ).toThrow(/runAt/);
    expect(() =>
      runEngine({
        config: { ...CONFIG, timezone: "Not/AZone" },
        events: [],
        ledger: [],
        runAt: RUN,
        closureAllowed: true,
      }),
    ).toThrow();
    expect(() =>
      runEngine({
        config: { ...CONFIG, season1Start: "2026-10-15" },
        events: [],
        ledger: [],
        runAt: RUN,
        closureAllowed: true,
      }),
    ).toThrow(/quarter/);
  });

  it("rejects a ledger with duplicate ids", () => {
    const entry: LedgerEntry = {
      id: "x",
      kind: "flag",
      rule: "flag.x",
      ruleVersion: "1.0.0",
      subject: [],
      amount: 0,
      createdAt: RUN,
    };
    expect(() => run([], [entry, entry])).toThrow(/Duplicate ledger id/);
  });
});
