import { beforeEach, describe, expect, it } from "vitest";
import { type EngineInput, runEngine } from "../../src/engine/engine.ts";
import type { LedgerEntry } from "../../src/engine/ledger.ts";
import { addDays } from "../../src/engine/time.ts";
import {
  type AnyEvent,
  CONFIG,
  commit,
  commitsOn,
  EXT,
  issue,
  OWN,
  pr,
  release,
  resetCounter,
  review,
  wib,
} from "../helpers/events.ts";

function run(events: AnyEvent[], runAt: string, extra: Partial<EngineInput> = {}) {
  return runEngine({ config: CONFIG, events, ledger: [], runAt, closureAllowed: true, ...extra });
}
const sum = (entries: LedgerEntry[], pred: (e: LedgerEntry) => boolean) =>
  entries.filter(pred).reduce((s, e) => s + e.amount, 0);
const stars = (entries: LedgerEntry[], season?: string) =>
  sum(entries, (e) => e.kind === "star" && (!season || e.season === season));

/** A Victory day: 3 commits (30 EXP) at a time that varies by day, so no clockwork pattern forms. */
function victoryDay(day: string, i: number): AnyEvent[] {
  const time = `${String(8 + (i % 11)).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}`;
  return commitsOn(day, 3, {}, time);
}

/** Victory on weekdays (Mon–Fri) from `from` through `to`. */
function weekdayVictories(from: string, to: string): AnyEvent[] {
  const out: AnyEvent[] = [];
  let i = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) out.push(...victoryDay(d, i++));
  }
  return out;
}

beforeEach(resetCounter);

describe("battles (tables §2.1)", () => {
  const RUN = "2026-10-26T00:00:00Z";

  it("scores 29 as Skirmish, 30 as Victory (+1 star, 15 BP)", () => {
    const skirmish = run(
      [...commitsOn("2026-10-15", 2), ...commitsOn("2026-10-15", 1, { adds: 1, dels: 0 }, "15:00")],
      RUN,
    );
    expect(stars(skirmish.ledger)).toBe(1); // 3 commits = 30 EXP → Victory
    const below = run(commitsOn("2026-10-15", 2), RUN);
    expect(below.ledger.filter((e) => e.kind === "star")).toEqual([]);
    expect(sum(skirmish.ledger, (e) => e.rule === "bp.battle_victory")).toBe(15);
  });

  it("gives MVP (+2 stars, 30 BP) only with score ≥ 100 and a contested objective", () => {
    const day = "2026-10-15";
    const mvp = run(
      [pr({ mergedAt: wib(day, "09:00"), repo: EXT }), ...commitsOn(day, 4, {}, "10:00")],
      RUN,
    ); // 60 + 40 = 100
    expect(stars(mvp.ledger)).toBe(2);
    expect(sum(mvp.ledger, (e) => e.rule.startsWith("bp.battle"))).toBe(30);
    const noObjective = run(
      [
        pr({ mergedAt: wib(day, "09:00") }),
        pr({ mergedAt: wib(day, "09:30") }),
        ...commitsOn(day, 10, {}, "10:00"),
      ],
      RUN,
    ); // 30 + 75 = 105, self-merges only
    expect(stars(noObjective.ledger)).toBe(1);
  });

  it("caps stars at 5 per ISO week and records the rest as overflow", () => {
    const week = [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ];
    const out = run(
      week.flatMap((d, i) => victoryDay(d, i)),
      RUN,
    );
    const starEntries = out.ledger.filter((e) => e.kind === "star");
    expect(starEntries.map((e) => e.amount)).toEqual([1, 1, 1, 1, 1, 0, 0]);
    expect(starEntries.slice(5).every((e) => e.reason === "overflow")).toBe(true);
    // Battle BP is still paid for overflow days (it is limited by the weekly BP cap instead).
    expect(sum(out.ledger, (e) => e.rule === "bp.battle_victory")).toBe(7 * 15);
  });

  it("produces no stars before Season 1 but keeps lifetime EXP and level BP", () => {
    const out = run(
      [...commitsOn("2026-09-20", 10), ...commitsOn("2026-09-21", 10, {}, "14:00")],
      "2026-10-05T00:00:00Z",
    );
    expect(sum(out.ledger, (e) => e.kind === "exp")).toBe(150);
    expect(out.ledger.filter((e) => e.kind === "star")).toEqual([]);
    expect(out.ledger.filter((e) => e.rule === "bp.activity")).toEqual([]);
    expect(out.ledger.filter((e) => e.rule === "bp.level_up").map((e) => e.amount)).toEqual([25]);
  });
});

describe("rank, trials and first-time tier BP", () => {
  it("climbs to Warden I without objectives, banking further stars (spam ceiling)", () => {
    const out = run(weekdayVictories("2026-10-01", "2026-12-24"), "2026-12-26T00:00:00Z");
    const s = out.progress.season;
    expect(s?.rawStars).toBeGreaterThan(41);
    expect(s?.rank.label).toBe("Warden I");
    expect(s?.bankedStars).toBe((s?.rawStars ?? 0) - 41);
    expect(s?.blockedBy).toBe("champion");
    expect(s?.trial).toMatchObject({
      tier: "champion",
      met: false,
      progress: { objectives: 0, contested: 0 },
    });
    expect(
      out.ledger.filter((e) => e.rule === "bp.tier_first").map((e) => [e.meta?.tier, e.amount]),
    ).toEqual([
      ["squire", 30],
      ["knight", 50],
      ["warden", 80],
    ]);
  });

  it("applies banked stars the moment the trial completes, and pays Champion BP once", () => {
    const base = weekdayVictories("2026-10-01", "2026-12-17");
    const first = run(base, "2026-12-19T00:00:00Z");
    expect(first.progress.season?.rank.label).toBe("Warden I");
    const objectives = [0, 1, 2].map((i) =>
      pr({ mergedAt: wib("2026-12-20", `0${i}:30`), repo: EXT }),
    );
    const second = run([...base, ...objectives], "2026-12-21T00:00:00Z", { ledger: first.ledger });
    expect(second.progress.season?.trial?.tier).toBe("paragon");
    expect(second.progress.season?.rank.tierIndex).toBeGreaterThanOrEqual(4);
    expect(
      second.newEntries.filter((e) => e.rule === "bp.tier_first").map((e) => e.meta?.tier),
    ).toEqual(["champion"]);
    const third = run([...base, ...objectives], "2026-12-22T00:00:00Z", { ledger: second.ledger });
    expect(third.newEntries).toEqual([]);
  });

  it("reports progress toward the next division", () => {
    const out = run(weekdayVictories("2026-10-01", "2026-10-09"), "2026-10-10T00:00:00Z");
    // 7 weekdays (Oct 1–9) → 7 stars, minus weekly caps: W40 Thu–Fri (2) + W41 Mon–Fri (5) = 7.
    expect(out.progress.season).toMatchObject({
      stars: 7,
      rank: { label: "Initiate I", starsInDivision: 1, starsForDivision: 3 },
      next: { label: "Squire III", starsNeeded: 2 },
    });
  });
});

describe("season transitions (GDD §H, tables §2.2–2.3)", () => {
  const s1 = () => weekdayVictories("2026-10-01", "2026-12-31");

  it("closes S1 only after the 48 h grace and only when closure is allowed", () => {
    const early = run(s1(), "2027-01-02T12:00:00Z");
    expect(early.ledger.some((e) => e.id === "season.close|S1")).toBe(false);
    expect(early.progress.season?.seasonId).toBe("S2");
    const blocked = run(s1(), "2027-01-03T00:00:00Z", { closureAllowed: false });
    expect(blocked.ledger.some((e) => e.id === "season.close|S1")).toBe(false);
    const closed = run(s1(), "2027-01-03T00:00:00Z");
    const close = closed.ledger.find((e) => e.id === "season.close|S1");
    expect(close?.meta).toMatchObject({ finalStars: 41, peakTier: "warden" });
    expect(closed.ledger.find((e) => e.id === "bp.season_end|S1")?.amount).toBe(350);
    expect(closed.progress.season).toMatchObject({
      seasonId: "S2",
      startStars: 0,
      rank: { label: "Initiate III" },
    });
  });

  it("soft-resets Champion to Squire III (−3 tiers)", () => {
    const champions = [0, 1, 2].map((i) =>
      pr({ mergedAt: wib("2026-10-05", `0${i}:30`), repo: EXT }),
    );
    const out = run([...s1(), ...champions], "2027-01-03T00:00:00Z");
    const close = out.ledger.find((e) => e.id === "season.close|S1");
    expect(close?.meta?.peakTier).toBe("champion");
    expect(out.ledger.find((e) => e.id === "bp.season_end|S1")?.amount).toBe(500);
    expect(out.progress.season).toMatchObject({
      seasonId: "S2",
      startStars: 9,
      rank: { label: "Squire III" },
    });
  });

  it("pays season-end rewards once and keeps closed seasons immutable", () => {
    const closed = run(s1(), "2027-01-03T00:00:00Z");
    const again = run(s1(), "2027-01-04T00:00:00Z", { ledger: closed.ledger });
    expect(
      again.newEntries.filter((e) => e.kind === "season" || e.rule === "bp.season_end"),
    ).toEqual([]);
    // A backfilled S1 commit arriving after closure earns lifetime EXP but no S1 stars.
    const late = run(
      [...s1(), ...commitsOn("2026-12-26", 10, {}, "13:13")],
      "2027-01-05T00:00:00Z",
      { ledger: again.ledger },
    );
    expect(late.newEntries.some((e) => e.kind === "exp")).toBe(true);
    expect(late.newEntries.filter((e) => e.kind === "star")).toEqual([]);
    expect(stars(late.ledger, "S1")).toBe(stars(closed.ledger, "S1"));
  });

  it("shares the weekly star cap across 2026-W53 while attributing stars to each season", () => {
    const days = [
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ];
    const out = run(
      days.flatMap((d, i) => victoryDay(d, i)),
      "2027-01-04T00:00:00Z",
      { closureAllowed: false },
    );
    const w53 = out.ledger.filter((e) => e.kind === "star" && e.week === "2026-W53");
    expect(sum(w53, () => true)).toBe(5);
    expect(stars(out.ledger, "S1")).toBe(4);
    expect(stars(out.ledger, "S2")).toBe(1);
  });

  it("closes several elapsed seasons in order when runs were missed", () => {
    const out = run(weekdayVictories("2026-10-01", "2026-10-31"), "2027-04-05T00:00:00Z");
    expect(out.ledger.filter((e) => e.kind === "season").map((e) => e.id)).toEqual([
      "season.close|S1",
      "season.close|S2",
    ]);
    expect(out.ledger.find((e) => e.id === "bp.season_end|S2")?.amount).toBe(100); // empty season: Initiate peak
    expect(out.progress.season?.seasonId).toBe("S3");
  });
});

describe("Battle Points", () => {
  it("pays floor(20% of EXP) as activity BP from Season 1 on", () => {
    const out = run([review({ at: wib("2026-10-15") })], "2026-10-26T00:00:00Z"); // 25 EXP → 5 BP
    expect(out.ledger.filter((e) => e.rule === "bp.activity").map((e) => e.amount)).toEqual([5]);
  });

  it("caps activity + battle BP at 700 per ISO week", () => {
    const filler: LedgerEntry = {
      id: "bp.activity|seed",
      kind: "bp",
      rule: "bp.activity",
      ruleVersion: "1.0.0",
      subject: ["seed"],
      amount: 690,
      effectiveDay: "2026-10-19",
      week: "2026-W43",
      season: "S1",
      createdAt: "2026-10-19T00:00:00Z",
    };
    const out = run(commitsOn("2026-10-20", 3), "2026-10-26T00:00:00Z", { ledger: [filler] });
    const bp = out.newEntries.filter((e) => e.kind === "bp" && e.week === "2026-W43");
    expect(bp.map((e) => [e.rule, e.amount, e.reason ?? ""])).toEqual([
      ["bp.activity", 2, ""],
      ["bp.activity", 2, ""],
      ["bp.activity", 2, ""],
      ["bp.battle_victory", 4, "weekly_cap"],
    ]);
  });

  it("pays 25 BP per level and 125 on every tenth level", () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      commitsOn(
        addDays("2026-08-01", i),
        10,
        {},
        `${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
      ),
    ).flat();
    const out = run(events, "2026-10-05T00:00:00Z"); // 40 × 75 = 3,000 EXP → level 10
    expect(out.progress.lifetime.level).toBe(10);
    const levels = out.ledger.filter((e) => e.rule === "bp.level_up").map((e) => e.amount);
    expect(levels).toEqual([25, 25, 25, 25, 25, 25, 25, 25, 125]);
  });
});

describe("corrections and deleted events", () => {
  const RUN1 = "2026-10-26T00:00:00Z";
  const RUN2 = "2026-10-27T00:00:00Z";

  it("awards a PR when a later revision shows it merged", () => {
    const open = pr({ id: "PR_x", mergedAt: null });
    const first = run([open], RUN1);
    expect(first.newEntries).toEqual([]);
    const merged = {
      ...pr({ id: "PR_x", mergedAt: wib("2026-10-26", "09:00"), repo: EXT }),
      rev: 2,
      firstSeenAt: open.firstSeenAt,
    };
    const second = run([merged], RUN2, { ledger: first.ledger });
    expect(second.newEntries.find((e) => e.rule === "exp.pr")).toMatchObject({
      amount: 60,
      subject: ["pr:PR_x@2"],
    });
  });

  it("never revokes an award when a later revision would no longer qualify", () => {
    const resolved = issue({
      id: "I_x",
      createdAt: wib("2026-10-20"),
      closedAt: wib("2026-10-21"),
    });
    const first = run([resolved], RUN1);
    const reopened = {
      ...resolved,
      rev: 2,
      metadata: {
        ...resolved.metadata,
        state: "OPEN" as const,
        stateReason: "REOPENED",
        closedAt: null,
        closedByPlayer: null,
      },
    };
    const second = run([reopened], RUN2, { ledger: first.ledger });
    expect(second.newEntries).toEqual([]);
    expect(sum(second.ledger, (e) => e.kind === "exp")).toBe(
      sum(first.ledger, (e) => e.kind === "exp"),
    );
  });

  it("flags awards whose source event disappeared, without changing any amount", () => {
    const c = commit({ at: wib("2026-10-20") });
    const first = run([c], RUN1);
    const second = run([], RUN2, { ledger: first.ledger });
    expect(second.newEntries).toEqual([
      expect.objectContaining({ id: `flag.source_unavailable|${c.key}`, kind: "flag", amount: 0 }),
    ]);
    expect(
      run([c], "2026-10-28T00:00:00Z", {
        ledger: first.ledger,
        unavailableKeys: [c.key],
      }).newEntries.map((e) => e.id),
    ).toEqual([`flag.source_unavailable|${c.key}`]);
  });

  it("attributes backdated commits to the day they could first count (effective date)", () => {
    const backdated = commit({ at: wib("2026-10-10"), firstSeenAt: "2026-10-20T03:00:00Z" });
    const out = run([backdated], RUN1);
    const entry = out.newEntries.find((e) => e.rule === "exp.commit");
    expect(entry).toMatchObject({ eventDay: "2026-10-10", effectiveDay: "2026-10-18" });
  });
});

describe("objectives", () => {
  it("records each objective once, with contested status and counterparts", () => {
    const out = run(
      [
        review({ at: wib("2026-10-15") }),
        issue({
          createdAt: wib("2026-10-14"),
          closedAt: wib("2026-10-15"),
          author: {
            id: 77,
            kind: "user",
            isPlayer: false,
            accountCreatedAt: "2019-01-01T00:00:00Z",
          },
        }),
        pr({
          mergedAt: wib("2026-10-15"),
          approvers: [{ id: 88, accountCreatedAt: "2019-01-01T00:00:00Z" }],
        }),
      ],
      "2026-10-26T00:00:00Z",
    );
    const objectives = out.ledger.filter((e) => e.kind === "trial");
    expect(objectives.map((e) => [e.rule, e.meta?.contested, e.meta?.counterparts]).sort()).toEqual(
      [
        ["objective.community_fix", true, "77"],
        ["objective.peer_review", true, "2000"],
        ["objective.reviewed_merge", true, "88"],
      ],
    );
    expect(out.progress.season?.trial?.progress).toEqual({
      objectives: 3,
      contested: 3,
      repos: 2,
      counterparts: 3,
    });
  });

  it("counts at most 2 release objectives per week", () => {
    const repos = [
      OWN,
      { ...OWN, id: "gh:8", fullName: "sample-player/r8" },
      { ...OWN, id: "gh:9", fullName: "sample-player/r9" },
    ];
    const events: AnyEvent[] = repos.flatMap((repo, i) =>
      commitsOn("2026-10-19", 3, { repo }, `${10 + i}:00`),
    );
    const releases = repos.map((repo, i) => release({ at: wib("2026-10-20", `0${i}:00`), repo }));
    const out = run([...events, ...releases], "2026-10-26T00:00:00Z");
    expect(out.ledger.filter((e) => e.rule === "objective.release").map((e) => e.amount)).toEqual([
      1, 1, 0,
    ]);
  });
});
