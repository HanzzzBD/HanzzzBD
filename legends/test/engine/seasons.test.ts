import { beforeEach, describe, expect, it } from "vitest";
import { type EngineInput, runEngine } from "../../src/engine/engine.ts";
import type { LedgerEntry } from "../../src/engine/ledger.ts";
import { rankFromStars } from "../../src/engine/rank.ts";
import { RULESET_V1 } from "../../src/engine/rules.ts";
import { addDays } from "../../src/engine/time.ts";
import {
  type AnyEvent,
  CONFIG,
  commit,
  commitsOn,
  OWN,
  resetCounter,
  snapshot,
  wib,
} from "../helpers/events.ts";

const run = (events: AnyEvent[], runAt: string, extra: Partial<EngineInput> = {}) =>
  runEngine({ config: CONFIG, events, ledger: [], runAt, closureAllowed: true, ...extra });

/** 48 h after the end of 2026-12-31 (WIB): the earliest instant Season 1 may close. */
const S1_CLOSES = "2027-01-02T17:00:00Z";
const before = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) - minutes * 60_000).toISOString().replace(".000Z", "Z");

/** Activity on `days` days of Season 1 (3 commits a day = one Victory). */
function battles(start: string, days: number, step = 1): AnyEvent[] {
  return Array.from({ length: days }, (_, i) =>
    commitsOn(addDays(start, i * step), 3, {}, `${String(9 + (i % 9)).padStart(2, "0")}:00`),
  ).flat();
}

beforeEach(resetCounter);

describe("season boundaries", () => {
  it("puts 23:59 WIB on 31 December in Season 1 and 00:00 WIB on 1 January in Season 2", () => {
    const events = [
      ...commitsOn("2026-12-31", 3, {}, "23:50", 60_000),
      ...commitsOn("2027-01-01", 3, {}, "00:00", 60_000),
    ];
    const out = run(events, "2027-01-01T12:00:00Z");
    const stars = out.ledger
      .filter((e) => e.rule === "star.victory")
      .map((e) => [e.effectiveDay, e.season]);
    expect(stars).toEqual([
      ["2026-12-31", "S1"],
      ["2027-01-01", "S2"],
    ]);
  });

  it("does not close a season before the 48 h grace has passed, or while the guard is down", () => {
    const events = battles("2026-10-05", 10);
    expect(run(events, before(S1_CLOSES, 1)).ledger.some((e) => e.id === "season.close|S1")).toBe(
      false,
    );
    expect(
      run(events, "2027-01-10T00:00:00Z", { closureAllowed: false }).ledger.some(
        (e) => e.id === "season.close|S1",
      ),
    ).toBe(false);
    expect(run(events, S1_CLOSES).ledger.some((e) => e.id === "season.close|S1")).toBe(true);
  });
});

describe("archived season records", () => {
  it("freeze the season summary into season.close", () => {
    const events = battles("2026-10-05", 12, 2);
    const out = run(events, S1_CLOSES);
    const archive = out.records.archived[0];
    expect(archive).toMatchObject({
      seasonId: "S1",
      startDay: "2026-10-01",
      endDay: "2026-12-31",
      closedAt: S1_CLOSES,
      rulesVersion: "1.0.0",
      seasonEndBp: out.ledger.find((e) => e.id === "bp.season_end|S1")?.amount,
    });
    expect(archive?.stats).toMatchObject({
      battles: 12,
      victories: 12,
      mvps: 0,
      skirmishes: 0,
      bestScore: 30,
      expEarned: 360,
    });
    expect(archive?.stats.dailyQuests).toBe(
      out.ledger.filter(
        (e) => e.rule === "quest.complete" && e.meta?.pool === "daily" && e.season === "S1",
      ).length,
    );
    expect(archive?.stats.medals).toBeGreaterThan(0);
    expect(archive?.stats.medalIds?.split(",")).toContain("M-001:-");
    expect(archive?.finalRank).toBe(rankFromStars(archive?.finalStars ?? -1, RULESET_V1).label);
    expect(archive?.finalStars).toBe(12);
  });

  it("rank the season's top heroes by mastery points gained, and grant no frame below Champion", () => {
    const events = [
      snapshot(OWN, "2026-10-01", { TypeScript: 800, Python: 200 }),
      ...battles("2026-10-05", 12, 2),
    ];
    const archive = run(events, S1_CLOSES).records.archived[0];
    // 36 commits × 10 EXP = 360 EXP, split 80/20 by bytes.
    expect(archive?.stats.topHeroes).toBe("syntaria:288,pytha:72");
    expect(archive?.seasonFrame).toBe(false);
  });

  it("never change after closure: later events, reruns and later seasons leave them intact", () => {
    const events = battles("2026-10-05", 12, 2);
    const closed = run(events, S1_CLOSES);
    const frozen = closed.ledger.find((e) => e.id === "season.close|S1") as LedgerEntry;
    // A late-seen commit dated inside Season 1 is credited, but on its effective day in Season 2.
    const late = commit({ at: wib("2026-12-20"), firstSeenAt: "2027-01-20T00:00:00Z" });
    const later = run([...events, late, ...battles("2027-01-05", 5)], "2027-02-01T00:00:00Z", {
      ledger: closed.ledger,
    });
    expect(later.ledger.find((e) => e.id === "season.close|S1")).toEqual(frozen);
    expect(later.records.archived[0]).toEqual(closed.records.archived[0]);
    expect(later.newEntries.find((e) => e.subject.includes(`${late.key}@1`))?.season ?? "S2").toBe(
      "S2",
    );
    expect(
      later.newEntries.some(
        (e) => e.season === "S1" && e.kind !== "medal" && e.rule !== "bp.medal",
      ),
    ).toBe(false);
  });
});

describe("lifetime progression", () => {
  it("survives the end of a season; only the season's stars are soft-reset", () => {
    const events = battles("2026-10-05", 30, 2);
    const during = run(events, "2026-12-30T00:00:00Z");
    const after = run(events, "2027-01-03T00:00:00Z", { ledger: during.ledger });
    expect(after.records.lifetime.exp).toBe(during.records.lifetime.exp);
    expect(after.records.lifetime.level).toBe(during.records.lifetime.level);
    expect(after.records.lifetime.medals).toBeGreaterThanOrEqual(during.records.lifetime.medals);
    expect(after.records.lifetime.bp).toBeGreaterThanOrEqual(during.records.lifetime.bp);
    expect(after.records.lifetime.seasonsArchived).toBe(1);
    expect(after.records.current?.seasonId).toBe("S2");
    expect(after.records.current?.stars).toBe(after.seasons[1]?.startStars);
    expect(after.records.current?.stars).toBeLessThan(during.records.current?.stars ?? 0);
    expect(after.records.current?.stats.battles).toBe(0);
  });

  it("keeps medals and campaigns earned in a closed season", () => {
    const events = battles("2026-10-05", 10);
    const closed = run(events, S1_CLOSES);
    const later = run(events, "2027-03-01T00:00:00Z", { ledger: closed.ledger });
    const medals = (o: typeof closed) =>
      o.ledger.filter((e) => e.kind === "medal").map((e) => e.id);
    expect(medals(later)).toEqual(expect.arrayContaining(medals(closed)));
    expect(later.records.lifetime.campaignsCompleted).toBeGreaterThanOrEqual(
      closed.records.lifetime.campaignsCompleted,
    );
  });
});

describe("schedule hints", () => {
  it("report the next local day, week and season boundaries", () => {
    // Tuesday 2026-10-20, 17:00 WIB.
    const out = run([], "2026-10-20T10:00:00Z");
    expect(out.schedule).toMatchObject({
      timezone: "Asia/Jakarta",
      today: "2026-10-20",
      nextDayStartsAt: "2026-10-20T17:00:00.000Z",
      nextWeekStartsAt: "2026-10-25T17:00:00.000Z",
      nextSeasonStartsAt: "2026-12-31T17:00:00.000Z",
    });
  });

  it("list periods waiting for the grace window or the closure guard", () => {
    const grace = run([], "2026-10-21T10:00:00Z");
    expect(grace.schedule.pending).toContainEqual({
      kind: "daily",
      period: "2026-10-20",
      closesAt: "2026-10-22T17:00:00.000Z",
      waitingFor: "grace",
    });
    const guard = run([], "2027-01-05T00:00:00Z", { closureAllowed: false });
    expect(guard.schedule.pending).toContainEqual({
      kind: "season",
      period: "S1",
      closesAt: S1_CLOSES.replace("Z", ".000Z"),
      waitingFor: "source_completeness",
    });
    const done = run([], "2027-01-05T00:00:00Z");
    expect(done.schedule.pending.filter((p) => p.waitingFor === "source_completeness")).toEqual([]);
  });

  it("catch up after missed runs: one late run equals daily runs", () => {
    const events = battles("2026-10-05", 10);
    const late = run(events, "2026-10-20T00:00:00Z");
    let ledger: LedgerEntry[] = [];
    for (let d = 5; d <= 19; d++) {
      const day = `2026-10-${String(d + 1).padStart(2, "0")}`;
      ledger = run(
        events.filter((e) => e.occurredAt < wib(day, "00:00")),
        wib(day, "00:17"),
        { ledger },
      ).ledger;
    }
    ledger = run(events, "2026-10-20T00:00:00Z", { ledger }).ledger;
    const rewards = (l: readonly LedgerEntry[]) =>
      l
        .filter((e) => e.kind === "quest" || e.kind === "medal" || e.kind === "bp")
        .map((e) => `${e.id}:${e.amount}:${e.effectiveDay}`)
        .sort();
    expect(rewards(ledger)).toEqual(rewards(late.ledger));
  });
});
