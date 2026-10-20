import { beforeEach, describe, expect, it } from "vitest";
import { type EngineInput, runEngine } from "../../src/engine/engine.ts";
import type { LedgerEntry } from "../../src/engine/ledger.ts";
import { DEDICATION, QUESTS } from "../../src/engine/quests/catalog.ts";
import { mondayOf, seededPick } from "../../src/engine/quests/engine.ts";
import { addDays, isoWeek } from "../../src/engine/time.ts";
import {
  type AnyEvent,
  CONFIG,
  commit,
  commitsOn,
  OWN2,
  resetCounter,
  wib,
} from "../helpers/events.ts";

const run = (events: AnyEvent[], runAt: string, extra: Partial<EngineInput> = {}) =>
  runEngine({ config: CONFIG, events, ledger: [], runAt, closureAllowed: true, ...extra });

/** A frozen board, as an earlier run would have written it. Lets a test choose the quests. */
function board(
  pool: "daily" | "weekly" | "specialty" | "contract",
  period: string,
  start: string,
  quests: string[],
): LedgerEntry {
  return {
    id: `quest.board|${pool}|${period}`,
    kind: "quest",
    rule: "quest.board",
    ruleVersion: "1.0.0",
    subject: [`board:${pool}:${period}`],
    amount: 0,
    effectiveDay: start,
    createdAt: `${start}T00:00:00Z`,
    meta: { pool, period, quests: quests.join(",") },
  };
}
const daily = (day: string, quests = ["D01", "D02", "D03"]) => board("daily", day, day, quests);
const ids = (entries: readonly LedgerEntry[], rule: string) =>
  entries
    .filter((e) => e.rule === rule)
    .map((e) => e.id)
    .sort();

/** Instant `hours` after the start of the player day following `day` (Asia/Jakarta). */
const afterDayEnd = (day: string, hours: number) =>
  new Date(Date.parse(wib(addDays(day, 1), "00:00")) + hours * 3_600_000)
    .toISOString()
    .replace(".000Z", "Z");

beforeEach(resetCounter);

describe("quest boards", () => {
  it("are seeded deterministically by player, period and rules version", () => {
    const pool = QUESTS.filter((q) => q.pool === "daily" && q.available);
    const pick = (player: number, day: string) => seededPick(pool, player, day, "1.0.0", "1")?.id;
    expect(pick(7, "2026-10-20")).toBe(pick(7, "2026-10-20"));
    const days = Array.from({ length: 30 }, (_, i) => addDays("2026-10-01", i));
    const a = days.map((d) => pick(7, d));
    const b = days.map((d) => pick(8, d));
    expect(a).not.toEqual(b);
    // Input order of the pool never matters.
    expect(seededPick([...pool].reverse(), 7, "2026-10-20", "1.0.0", "1")?.id).toBe(
      pick(7, "2026-10-20"),
    );
  });

  it("writes one frozen board per period: three distinct dailies, never regenerated", () => {
    const out = run(commitsOn("2026-10-20", 3), "2026-10-21T00:00:00Z", {
      config: { ...CONFIG, playerId: 7 },
    });
    const boards = out.newEntries.filter(
      (e) => e.rule === "quest.board" && e.meta?.pool === "daily",
    );
    expect(boards).toHaveLength(21); // 2026-10-01 … 2026-10-21
    for (const b of boards) {
      const quests = String(b.meta?.quests).split(",");
      expect(quests).toHaveLength(3);
      expect(new Set(quests).size).toBe(3);
    }
    // A different seed on rerun cannot change a board that already exists.
    const rerun = run(commitsOn("2026-10-20", 3), "2026-10-21T00:00:00Z", {
      config: { ...CONFIG, playerId: 99 },
      ledger: out.ledger,
    });
    expect(rerun.newEntries.filter((e) => e.rule === "quest.board")).toEqual([]);
    expect(rerun.quests.today?.quests.map((q) => q.id)).toEqual(
      out.quests.today?.quests.map((q) => q.id),
    );
  });

  it("never puts an unavailable quest on a board", () => {
    const out = run(commitsOn("2026-10-20", 3), "2026-11-30T00:00:00Z");
    const unavailable = new Set(QUESTS.filter((q) => !q.available).map((q) => q.id));
    const onBoards = out.ledger
      .filter((e) => e.rule === "quest.board")
      .flatMap((e) => String(e.meta?.quests).split(","));
    expect(onBoards.filter((q) => unavailable.has(q))).toEqual([]);
  });

  it("offers weekly quests only from level 3 (level at the start of the week)", () => {
    const out = run(commitsOn("2026-10-20", 3), "2026-10-21T00:00:00Z");
    const week = out.ledger.find((e) => e.id === `quest.board|weekly|${isoWeek("2026-10-19")}`);
    expect(week?.meta?.quests).toBe("");
  });
});

describe("completion and rewards", () => {
  it("completes a quest once, on the day of the qualifying activity, for BP only (STK-5)", () => {
    const day = "2026-10-20";
    const out = run(commitsOn(day, 3), "2026-10-21T00:00:00Z", { ledger: [daily(day)] });
    expect(ids(out.newEntries, "quest.complete")).toEqual([
      `quest|D01|${day}`,
      `quest|D02|${day}`,
      `quest|D03|${day}`,
    ]);
    const bp = out.newEntries.filter((e) => e.rule === "bp.quest");
    expect(bp.map((e) => [e.id, e.amount, e.effectiveDay])).toEqual([
      [`bp.quest|D01|${day}`, 10, day],
      [`bp.quest|D02|${day}`, 15, day],
      [`bp.quest|D03|${day}`, 15, day],
    ]);
    // Quests never grant EXP or stars.
    const questSubjects = out.newEntries.filter((e) =>
      e.subject.some((s) => s.startsWith("quest:")),
    );
    expect(new Set(questSubjects.map((e) => e.kind))).toEqual(new Set(["quest", "bp"]));
    const without = run(commitsOn(day, 3), "2026-10-21T00:00:00Z");
    const sum = (o: typeof out, kind: string) =>
      o.ledger.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
    expect(sum(out, "exp")).toBe(sum(without, "exp"));
    expect(sum(out, "star")).toBe(sum(without, "star"));
  });

  it("is idempotent: rerunning, or replaying duplicate events, adds no reward", () => {
    const day = "2026-10-20";
    const events = commitsOn(day, 3);
    const first = run(events, "2026-10-21T00:00:00Z", { ledger: [daily(day)] });
    const again = run([...events, ...events], "2026-10-21T00:00:00Z", { ledger: first.ledger });
    expect(again.newEntries).toEqual([]);
    expect(first.ledger.filter((e) => e.id.startsWith(`bp.quest|D01|${day}`))).toHaveLength(1);
  });

  it("does not complete a quest from partial progress", () => {
    const day = "2026-10-20";
    const out = run(commitsOn(day, 2), "2026-10-21T00:00:00Z", { ledger: [daily(day)] });
    expect(ids(out.newEntries, "quest.complete")).toEqual([`quest|D01|${day}`]);
    const view = out.quests.today;
    expect(view?.period.id).toBe("2026-10-21");
  });

  it("pays Dedication once per week, on the fifth day with all three dailies done, stacking with the dailies", () => {
    const days = [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ];
    const events = days.flatMap((d) => commitsOn(d, 3));
    const out = run(events, "2026-10-25T00:00:00Z", { ledger: days.map((d) => daily(d)) });
    const dedication = out.newEntries.filter((e) => e.id.startsWith(`bp.quest|${DEDICATION.id}|`));
    expect(dedication.map((e) => [e.id, e.amount, e.effectiveDay])).toEqual([
      [`bp.quest|dedication|2026-W43`, 50, "2026-10-23"],
    ]);
    expect(
      out.newEntries.filter((e) => e.rule === "bp.quest" && !e.id.includes("dedication")),
    ).toHaveLength(18);
  });
});

describe("expiration (48 h grace and the closure guard)", () => {
  const day = "2026-10-20";

  it("keeps a period open until 48 h after the player day ends", () => {
    const open = run(commitsOn(day, 1), afterDayEnd(day, 48 - 1 / 60), { ledger: [daily(day)] });
    expect(open.ledger.some((e) => e.id === `quest.closed|daily|${day}`)).toBe(false);
    expect(ids(open.ledger, "quest.expired").filter((id) => id.endsWith(day))).toEqual([]);

    const closed = run(commitsOn(day, 1), afterDayEnd(day, 48), { ledger: [daily(day)] });
    expect(closed.ledger.some((e) => e.id === `quest.closed|daily|${day}`)).toBe(true);
    expect(ids(closed.ledger, "quest.expired").filter((id) => id.endsWith(day))).toEqual([
      `quest.expired|D02|${day}`,
      `quest.expired|D03|${day}`,
    ]);
    expect(closed.ledger.find((e) => e.id === `quest.expired|D02|${day}`)).toMatchObject({
      amount: 0,
      reason: "expired",
    });
  });

  it("never closes a period while the closure guard is down (incomplete sources)", () => {
    const out = run(commitsOn(day, 1), afterDayEnd(day, 96), {
      ledger: [daily(day)],
      closureAllowed: false,
    });
    expect(out.ledger.some((e) => e.id === `quest.closed|daily|${day}`)).toBe(false);
    expect(out.schedule.pending).toContainEqual(
      expect.objectContaining({ kind: "daily", period: day, waitingFor: "source_completeness" }),
    );
  });

  it("never completes a quest after its period closed", () => {
    const closed = run([], afterDayEnd(day, 48), { ledger: [daily(day)] });
    // Activity that happened that day but was first seen after closure counts on a later day.
    const late = commitsOn(day, 3, { firstSeenAt: afterDayEnd(day, 49) });
    const out = run(late, afterDayEnd(day, 50), { ledger: closed.ledger });
    expect(ids(out.ledger, "quest.complete").filter((id) => id.endsWith(`|${day}`))).toEqual([]);
    expect(
      out.newEntries.filter((e) => e.rule === "exp.commit").every((e) => e.effectiveDay !== day),
    ).toBe(true);
  });

  it("closes a weekly board 48 h after Sunday ends and expires what is left", () => {
    const monday = "2026-10-19";
    const week = isoWeek(monday);
    const ledger = [board("weekly", week, monday, ["W02"])];
    const sunday = addDays(monday, 6);
    const open = run([], afterDayEnd(sunday, 47), { ledger });
    expect(open.ledger.some((e) => e.id === `quest.closed|weekly|${week}`)).toBe(false);
    const closed = run([], afterDayEnd(sunday, 48), { ledger });
    expect(ids(closed.ledger, "quest.expired").filter((id) => id.endsWith(week))).toEqual([
      `quest.expired|W02|${week}`,
    ]);
  });
});

describe("timezone and calendar boundaries", () => {
  it("splits activity at local midnight (Asia/Jakarta), not UTC midnight", () => {
    const late = commitsOn("2026-10-20", 3, {}, "23:55");
    const early = commitsOn("2026-10-21", 3, {}, "00:01");
    const ledger = [daily("2026-10-20"), daily("2026-10-21")];
    const before = run(late, "2026-10-23T00:00:00Z", { ledger });
    expect(ids(before.ledger, "quest.complete")).toEqual([
      "quest|D01|2026-10-20",
      "quest|D02|2026-10-20",
      "quest|D03|2026-10-20",
    ]);
    const after = run(early, "2026-10-23T00:00:00Z", { ledger });
    expect(ids(after.ledger, "quest.complete")).toEqual([
      "quest|D01|2026-10-21",
      "quest|D02|2026-10-21",
      "quest|D03|2026-10-21",
    ]);
    // 23:55 WIB on 10-20 is 16:55 UTC; 00:01 WIB on 10-21 is still 10-20 in UTC.
    expect(early[0]?.occurredAt.startsWith("2026-10-20T17:01")).toBe(true);
  });

  it("keeps ISO week 2026-W53 as one week across the season boundary", () => {
    expect(isoWeek("2026-12-28")).toBe("2026-W53");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
    expect(mondayOf("2027-01-03")).toBe("2026-12-28");
    const days = ["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"];
    const events = days.flatMap((d) => commitsOn(d, 3));
    const out = run(events, "2027-01-03T00:00:00Z", { ledger: days.map((d) => daily(d)) });
    const dedication = out.ledger.filter(
      (e) => e.rule === "quest.complete" && e.id.startsWith("quest|dedication|"),
    );
    expect(dedication.map((e) => [e.id, e.effectiveDay, e.season])).toEqual([
      ["quest|dedication|2026-W53", "2027-01-02", "S2"],
    ]);
    // Each daily completion belongs to the season of its own day.
    expect(out.ledger.find((e) => e.id === "quest|D01|2026-12-31")?.season).toBe("S1");
    expect(out.ledger.find((e) => e.id === "quest|D01|2027-01-01")?.season).toBe("S2");
    expect(out.ledger.filter((e) => e.id === "quest.board|weekly|2026-W53")).toHaveLength(1);
  });
});

describe("season contracts", () => {
  it("expire when the season closes, together with the season", () => {
    const ledger = [board("contract", "S1", "2026-10-01", ["S01", "S03"])];
    const lastDay = "2026-12-31";
    const open = run(commitsOn("2026-10-20", 3), afterDayEnd(lastDay, 47), { ledger });
    expect(open.ledger.some((e) => e.id === "quest.closed|contract|S1")).toBe(false);
    expect(open.ledger.some((e) => e.id === "season.close|S1")).toBe(false);
    const closed = run(commitsOn("2026-10-20", 3), afterDayEnd(lastDay, 48), { ledger });
    expect(ids(closed.ledger, "quest.expired").filter((id) => id.endsWith("|S1"))).toEqual([
      "quest.expired|S01|S1",
      "quest.expired|S03|S1",
    ]);
    expect(closed.ledger.some((e) => e.id === "season.close|S1")).toBe(true);
    expect(closed.ledger.find((e) => e.id === "season.close|S1")?.meta?.contracts).toBe(0);
  });

  it("draws two contracts per season", () => {
    const out = run(commitsOn("2026-10-20", 3), "2026-10-21T00:00:00Z");
    expect(
      String(out.ledger.find((e) => e.id === "quest.board|contract|S1")?.meta?.quests).split(","),
    ).toHaveLength(2);
  });
});

describe("campaigns (milestone quests)", () => {
  it("record steps in order and pay only on completion (STK-11)", () => {
    const out = run(commitsOn("2026-10-20", 3), "2026-10-21T00:00:00Z");
    const steps = out.ledger.filter((e) => e.rule === "campaign.step");
    for (const s of steps) {
      const [, id, n] = s.id.split("|");
      for (let k = 1; k < Number(n); k++)
        expect(out.ledger.some((e) => e.id === `campaign.step|${id}|${k}`)).toBe(true);
    }
    expect(
      out.ledger.filter(
        (e) =>
          e.kind === "bp" &&
          e.subject.some((x) => x.startsWith("campaign:")) &&
          !e.rule.startsWith("bp.campaign"),
      ),
    ).toEqual([]);
    const paid = out.ledger.filter((e) => e.rule === "bp.campaign").map((e) => e.id.split("|")[1]);
    const done = out.ledger
      .filter((e) => e.rule === "campaign.complete")
      .map((e) => e.id.split("|")[1]);
    expect(paid).toEqual(done);
    expect(out.campaigns.find((c) => c.id === "K9")).toMatchObject({
      available: false,
      completed: false,
    });
  });

  it("never pays a campaign twice", () => {
    const events = [...commitsOn("2026-10-20", 3), commit({ at: wib("2026-10-21"), repo: OWN2 })];
    const first = run(events, "2026-10-22T00:00:00Z");
    const second = run(events, "2026-10-22T00:00:00Z", { ledger: first.ledger });
    expect(second.newEntries).toEqual([]);
  });
});
