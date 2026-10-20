import { beforeEach, describe, expect, it } from "vitest";
import { type EngineInput, runEngine } from "../../src/engine/engine.ts";
import type { LedgerEntry } from "../../src/engine/ledger.ts";
import { MEDALS, RARITY_REWARDS, type Rarity } from "../../src/engine/medals.ts";
import { addDays } from "../../src/engine/time.ts";
import type { NormalizedEvent } from "../../src/normalize/event.ts";
import {
  type AnyEvent,
  CONFIG,
  commitsOn,
  HUMAN,
  issue,
  pr,
  resetCounter,
  review,
  wib,
} from "../helpers/events.ts";

const run = (
  events: AnyEvent[],
  runAt = "2026-11-30T00:00:00Z",
  extra: Partial<EngineInput> = {},
) => runEngine({ config: CONFIG, events, ledger: [], runAt, closureAllowed: true, ...extra });
const medal = (ledger: readonly LedgerEntry[], id: string, tier = "-") =>
  ledger.find((e) => e.id === `medal|${id}|${tier}`);

function calendarDay(
  date: string,
  count: number,
  status: "verified" | "partial" | "unverifiable" = "partial",
): NormalizedEvent<"contribution_day"> {
  return {
    key: `cal:${date}`,
    type: "contribution_day",
    rev: 1,
    repo: null,
    actor: null,
    occurredAt: `${date}T00:00:00Z`,
    firstSeenAt: `${date}T00:00:00Z`,
    metadata: { date, count },
    provenance: { sources: ["calendar"], api: "graphql", collectorVersion: "1" },
    verification: { status, notes: status === "partial" ? ["calendar_timezone_unconfirmed"] : [] },
  };
}

/** `days` days of 10 commits from `start`, at varied times. */
function workDays(start: string, days: number, perDay = 10): AnyEvent[] {
  return Array.from({ length: days }, (_, i) =>
    commitsOn(
      addDays(start, i),
      perDay,
      {},
      `${String(8 + (i % 10)).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}`,
    ),
  ).flat();
}

beforeEach(resetCounter);

describe("medal catalog", () => {
  it("covers M-001…M-104 with unique ids and catalog rarities", () => {
    const ids = MEDALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("M-001");
    expect(ids).toContain("M-104");
    for (const m of MEDALS) {
      expect(m.tiers.length > 0 || m.perSeason !== undefined).toBe(true);
      for (const p of m.prerequisites) expect(ids).toContain(p);
    }
  });

  it("uses the approved rarity rewards", () => {
    expect(RARITY_REWARDS).toEqual({
      common: { bp: 25, cosmetic: null },
      uncommon: { bp: 50, cosmetic: null },
      rare: { bp: 100, cosmetic: "title_or_badge_style" },
      epic: { bp: 200, cosmetic: "frame" },
      legendary: { bp: 400, cosmetic: "animated_frame" },
    });
  });

  it("marks squad and map medals unavailable and never awards them", () => {
    const out = run(workDays("2026-10-01", 30));
    for (const id of ["M-064", "M-090", "M-091", "M-092"]) {
      expect(MEDALS.find((m) => m.id === id)?.available).toBe(false);
      expect(out.ledger.some((e) => e.kind === "medal" && e.meta?.medal === id)).toBe(false);
      expect(out.medals.find((m) => m.id === id)).toMatchObject({
        available: false,
        earned: false,
      });
    }
  });
});

describe("one-time medals", () => {
  it("records the day of the qualifying event, the run that noticed it, and its evidence", () => {
    const out = run(commitsOn("2026-10-05", 1), "2026-10-25T00:00:00Z");
    expect(medal(out.ledger, "M-001")).toMatchObject({
      kind: "medal",
      effectiveDay: "2026-10-05",
      createdAt: "2026-10-25T00:00:00Z",
      season: "S1",
      meta: expect.objectContaining({
        medal: "M-001",
        rarity: "common",
        provenance: "ledger:exp.commit",
      }),
    });
    expect(String(medal(out.ledger, "M-001")?.meta?.evidence)).toMatch(/^exp\.commit\|/);
    expect(out.ledger.find((e) => e.id === "bp.medal|M-001|-")).toMatchObject({
      amount: 25,
      effectiveDay: "2026-10-05",
    });
    const view = out.medals.find((m) => m.id === "M-001");
    expect(view).toMatchObject({
      earned: true,
      earnedOn: "2026-10-05",
      recordedAt: "2026-10-25T00:00:00Z",
    });
  });

  it("pays each medal tier once, whatever the number of reruns or duplicate events", () => {
    const events = commitsOn("2026-10-05", 3);
    const first = run(events);
    const again = run([...events, ...events], "2026-11-30T00:00:00Z", { ledger: first.ledger });
    expect(again.newEntries).toEqual([]);
    expect(first.ledger.filter((e) => e.id === "bp.medal|M-001|-")).toHaveLength(1);
  });

  it("pays the rarity reward and cosmetic class for every medal earned", () => {
    const events = [
      ...workDays("2026-10-01", 12),
      pr({ id: "P1", mergedAt: wib("2026-10-03", "20:00") }),
      review({ at: wib("2026-10-04", "20:00"), prAuthor: HUMAN(2001) }),
      issue({
        createdAt: wib("2026-10-02", "11:00"),
        closedAt: wib("2026-10-06", "11:00"),
        author: HUMAN(2002),
        closedByPlayer: true,
      }),
    ];
    const out = run(events);
    const earned = out.ledger.filter((e) => e.kind === "medal");
    expect(earned.length).toBeGreaterThan(3);
    for (const m of earned) {
      const reward = RARITY_REWARDS[m.meta?.rarity as Rarity];
      const bp = out.ledger.find((e) => e.id === `bp.medal|${m.meta?.medal}|${m.meta?.tier}`);
      expect(bp?.amount).toBe(reward.bp);
      expect(bp?.meta?.cosmetic ?? null).toBe(reward.cosmetic);
      expect(bp?.effectiveDay).toBe(m.effectiveDay);
    }
  });

  it("awards tiers in order and only after prerequisites", () => {
    const out = run(workDays("2026-10-01", 12));
    const earned = out.ledger.filter((e) => e.kind === "medal");
    for (const m of earned) {
      const def = MEDALS.find((d) => d.id === m.meta?.medal);
      for (const p of def?.prerequisites ?? [])
        expect(out.ledger.some((e) => e.kind === "medal" && e.meta?.medal === p)).toBe(true);
      const tierIndex = def?.tiers.findIndex((t) => t.tier === m.meta?.tier) ?? -1;
      for (let k = 0; k < tierIndex; k++)
        expect(medal(out.ledger, def?.id ?? "", def?.tiers[k]?.tier)).toBeDefined();
    }
    // Committed I: 100 commits that earned EXP; the 100th lands on day 10 (10 per day).
    expect(medal(out.ledger, "M-010", "I")?.effectiveDay).toBe("2026-10-10");
    expect(medal(out.ledger, "M-010", "II")).toBeUndefined();
  });

  it("counts only commits that earned EXP (capped commits never count)", () => {
    // 20 commits a day: the commit curve pays the first 10 only.
    const out = run(workDays("2026-10-01", 6, 20));
    expect(medal(out.ledger, "M-010", "I")).toBeUndefined();
    expect(out.medals.find((m) => m.id === "M-010" && m.tier === "I")?.progress.current).toBe(60);
  });

  it("counts reviews from distinct human authors for Peer Reviewer", () => {
    const sameAuthor = Array.from({ length: 6 }, (_, i) =>
      review({ at: wib(addDays("2026-10-02", i), "20:00"), prAuthor: HUMAN(2001), id: `R${i}` }),
    );
    expect(medal(run(sameAuthor).ledger, "M-062")).toBeUndefined();
    const distinct = Array.from({ length: 5 }, (_, i) =>
      review({
        at: wib(addDays("2026-10-02", i), "20:00"),
        prAuthor: HUMAN(2001 + i),
        id: `R${i}`,
      }),
    );
    expect(medal(run(distinct).ledger, "M-062")?.effectiveDay).toBe("2026-10-06");
  });
});

describe("verification", () => {
  it("never awards medals from unverifiable activity", () => {
    const fake = commitsOn("2026-10-05", 3).map((e) => ({
      ...e,
      verification: { status: "unverifiable" as const, notes: ["test"] },
    }));
    const out = run(fake);
    expect(out.ledger.filter((e) => e.kind === "medal")).toEqual([]);
    expect(out.ledger.filter((e) => e.kind === "exp")).toEqual([]);
    expect(out.diagnostics.find((d) => d.code === "unverifiable_event")?.count).toBe(3);
  });

  it("builds streak medals from the contribution calendar, skipping unverifiable days", () => {
    const days = Array.from({ length: 8 }, (_, i) => addDays("2026-10-01", i));
    const out = run(days.map((d) => calendarDay(d, 2)));
    expect(medal(out.ledger, "M-020", "I")?.effectiveDay).toBe("2026-10-07");
    const broken = run(days.map((d, i) => calendarDay(d, 2, i === 3 ? "unverifiable" : "partial")));
    expect(medal(broken.ledger, "M-020", "I")).toBeUndefined();
  });

  it("does not let configuration unlock medals", () => {
    const out = run(commitsOn("2026-10-05", 1), "2026-11-30T00:00:00Z", {
      config: {
        ...CONFIG,
        build: ["docker", "compose", "nginx", "vitest", "jest"],
        declaredTools: ["docker"],
      },
    });
    for (const id of ["M-080", "M-081", "M-082"])
      expect(out.ledger.some((e) => e.meta?.medal === id)).toBe(false);
  });
});

describe("hidden medals", () => {
  it("show only a hint until earned", () => {
    const out = run(commitsOn("2026-10-05", 3));
    const phoenix = out.medals.find((m) => m.id === "M-100");
    expect(phoenix).toMatchObject({
      name: "???",
      hidden: true,
      earned: false,
      hint: "Every legend returns.",
    });
  });

  it("Phoenix: a Victory after 30 or more days without a battle", () => {
    const out = run([...commitsOn("2026-10-02", 3), ...commitsOn("2026-11-02", 3)]);
    expect(medal(out.ledger, "M-100")?.effectiveDay).toBe("2026-11-02");
    expect(out.medals.find((m) => m.id === "M-100")).toMatchObject({
      name: "Phoenix",
      hidden: false,
      earned: true,
    });
    const close = run([...commitsOn("2026-10-02", 3), ...commitsOn("2026-10-31", 3)]);
    expect(medal(close.ledger, "M-100")).toBeUndefined();
  });
});

describe("repeatable medals (one per season)", () => {
  const contract = (
    season: string,
    start: string,
    quests: string[],
    doneOn: string | null,
  ): LedgerEntry[] => [
    {
      id: `quest.board|contract|${season}`,
      kind: "quest",
      rule: "quest.board",
      ruleVersion: "1.0.0",
      subject: [`board:contract:${season}`],
      amount: 0,
      effectiveDay: start,
      createdAt: `${start}T00:00:00Z`,
      meta: { pool: "contract", period: season, quests: quests.join(",") },
    },
    ...(doneOn
      ? quests.map(
          (q): LedgerEntry => ({
            id: `quest|${q}|${season}`,
            kind: "quest",
            rule: "quest.complete",
            ruleVersion: "1.0.0",
            subject: [`quest:${q}:${season}`],
            amount: 0,
            effectiveDay: doneOn,
            season,
            createdAt: `${doneOn}T00:00:00Z`,
            meta: { pool: "contract", period: season, quest: q },
          }),
        )
      : []),
  ];

  it("S<n> Contender: earned once per season with both contracts complete", () => {
    const ledger = [
      ...contract("S1", "2026-10-01", ["S01", "S03"], "2026-12-20"),
      ...contract("S2", "2027-01-01", ["S02", "S04"], "2027-02-10"),
    ];
    const out = run(commitsOn("2026-10-05", 1), "2027-02-11T00:00:00Z", { ledger });
    expect(medal(out.ledger, "M-036", "S1")).toMatchObject({
      effectiveDay: "2026-12-20",
      season: "S1",
    });
    expect(medal(out.ledger, "M-036", "S2")).toMatchObject({
      effectiveDay: "2027-02-10",
      season: "S2",
    });
    expect(
      out.ledger.filter((e) => e.id.startsWith("bp.medal|M-036|")).map((e) => e.amount),
    ).toEqual([50, 50]);
  });

  it("is not earned with only one contract done", () => {
    const ledger = contract("S1", "2026-10-01", ["S01", "S03"], null);
    ledger.push({ ...(contract("S1", "2026-10-01", ["S01"], "2026-12-20")[1] as LedgerEntry) });
    const out = run(commitsOn("2026-10-05", 1), "2026-12-21T00:00:00Z", { ledger });
    expect(medal(out.ledger, "M-036", "S1")).toBeUndefined();
    expect(out.medals.find((m) => m.id === "M-036" && m.tier === "S1")?.progress).toMatchObject({
      current: 1,
      target: 2,
    });
  });
});

describe("rank medals", () => {
  it("are never awarded from commits alone above the anti-manipulation ceiling", () => {
    const out = run(workDays("2026-10-01", 40), "2026-11-30T00:00:00Z");
    expect(medal(out.ledger, "M-031")).toBeUndefined();
    expect(out.ledger.some((e) => e.id === "medal|M-001|-")).toBe(true);
  });
});
