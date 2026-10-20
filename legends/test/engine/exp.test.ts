import { beforeEach, describe, expect, it } from "vitest";
import { type EngineInput, runEngine } from "../../src/engine/engine.ts";
import type { LedgerEntry } from "../../src/engine/ledger.ts";
import {
  type AnyEvent,
  BOT,
  CONFIG,
  commit,
  commitsOn,
  EXT,
  FORK,
  HUMAN,
  issue,
  OWN,
  OWN2,
  pr,
  privateCount,
  release,
  resetCounter,
  review,
  wib,
} from "../helpers/events.ts";

const RUN = "2026-10-25T00:00:00Z";
function run(events: AnyEvent[], extra: Partial<EngineInput> = {}) {
  return runEngine({
    config: CONFIG,
    events,
    ledger: [],
    runAt: RUN,
    closureAllowed: true,
    ...extra,
  });
}
const exp = (entries: LedgerEntry[], rule?: string) =>
  entries
    .filter((e) => e.kind === "exp" && (!rule || e.rule === rule))
    .reduce((s, e) => s + e.amount, 0);
const diag = (out: ReturnType<typeof run>, code: string) =>
  out.diagnostics.find((d) => d.code === code)?.count ?? 0;

beforeEach(resetCounter);

describe("commit EXP (R-01)", () => {
  it("awards 10 for commits 1–5, 5 for 6–10, 0 after (75 max per day)", () => {
    const out = run(commitsOn("2026-10-15", 15));
    const amounts = out.newEntries.filter((e) => e.rule === "exp.commit").map((e) => e.amount);
    expect(amounts).toEqual([10, 10, 10, 10, 10, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0]);
    expect(
      out.newEntries.filter((e) => e.rule === "exp.commit" && e.reason === "capped"),
    ).toHaveLength(5);
    expect(exp(out.ledger)).toBe(75);
  });

  it("uses the player's local day (Asia/Jakarta) for the daily curve", () => {
    // 23:59 and 00:01 local are different days even though both are the same UTC date.
    const out = run([
      commit({ at: wib("2026-10-15", "23:59") }),
      commit({ at: wib("2026-10-16", "00:01") }),
    ]);
    expect(out.newEntries.filter((e) => e.rule === "exp.commit").map((e) => e.eventDay)).toEqual([
      "2026-10-15",
      "2026-10-16",
    ]);
  });

  it("continues ordinals from the existing ledger for late commits (append-only)", () => {
    const first = run(commitsOn("2026-10-15", 9));
    const late = run(
      [commit({ at: wib("2026-10-15", "06:00") }), commit({ at: wib("2026-10-15", "06:01") })],
      { ledger: first.ledger },
    );
    expect(
      late.newEntries
        .filter((e) => e.rule === "exp.commit")
        .map((e) => [e.meta?.ordinal, e.amount]),
    ).toEqual([
      [10, 5],
      [11, 0],
    ]);
  });

  it("gives zero activity zero everything", () => {
    const out = run([]);
    expect(out.newEntries).toEqual([]);
    expect(out.progress.lifetime).toMatchObject({ exp: 0, level: 1, bp: 0 });
    expect(out.progress.season?.rank.label).toBe("Initiate III");
  });
});

describe("anti-abuse qualification", () => {
  it("rejects empty, merge, bot, fork, unattributed and co-authored-only commits", () => {
    const out = run([
      commit({ at: wib("2026-10-15"), adds: 0, dels: 0 }),
      commit({ at: wib("2026-10-15"), parents: 2 }),
      commit({ at: wib("2026-10-15"), actor: BOT }),
      commit({ at: wib("2026-10-15"), repo: FORK }),
      commit({ at: wib("2026-10-15"), actor: null }),
      commit({ at: wib("2026-10-15"), primary: false }),
    ]);
    expect(out.newEntries).toEqual([]);
    for (const code of [
      "empty_commit",
      "merge_commit",
      "bot_actor",
      "fork_repo",
      "missing_actor",
      "not_player_author",
    ]) {
      expect(diag(out, code)).toBe(1);
    }
  });

  it("rejects invalid timestamps: unparseable, pre-2008, and far ahead of first observation", () => {
    const out = run([
      commit({ at: "not-a-date" }),
      commit({ at: "2001-01-01T00:00:00Z" }),
      commit({ at: "2027-06-01T00:00:00Z", firstSeenAt: "2026-10-15T00:00:00Z" }),
    ]);
    expect(out.newEntries).toEqual([]);
    expect(diag(out, "invalid_timestamp")).toBe(3);
  });

  it("counts the same SHA in two repos once (duplicate contributions across repositories)", () => {
    const sha = "a".repeat(40);
    const out = run([
      commit({ at: wib("2026-10-15", "09:00"), sha }),
      commit({ at: wib("2026-10-15", "09:05"), sha, repo: OWN2 }),
    ]);
    expect(out.newEntries.filter((e) => e.rule === "exp.commit")).toHaveLength(1);
    expect(diag(out, "duplicate_sha")).toBe(1);
  });

  it("counts rebased or cherry-picked copies (same fingerprint, ≤ 30 days) once", () => {
    const out = run([
      commit({ at: wib("2026-10-02"), fingerprint: "f" }),
      commit({ at: wib("2026-10-20"), fingerprint: "f" }),
      commit({ at: wib("2026-10-20", "11:00"), fingerprint: "f", repo: OWN2 }),
    ]);
    expect(out.newEntries.filter((e) => e.rule === "exp.commit")).toHaveLength(2);
    expect(diag(out, "duplicate_fingerprint")).toBe(1);
  });

  it("ignores duplicate input events (same key delivered twice) and uses the latest revision", () => {
    const c = commit({ at: wib("2026-10-15") });
    const out = run([c, { ...c }, { ...c, rev: 2 }]);
    expect(out.newEntries.filter((e) => e.rule === "exp.commit")).toHaveLength(1);
    expect(out.newEntries[0]?.subject).toEqual([`${c.key}@2`]);
    expect(diag(out, "duplicate_event_input")).toBe(2);
  });

  it("rejects events never merged into state (rev 0)", () => {
    const out = run([{ ...commit({ at: wib("2026-10-15") }), rev: 0 }]);
    expect(out.newEntries).toEqual([]);
    expect(diag(out, "unmerged_event")).toBe(1);
  });

  it("flags clockwork automation (same ±2 min on ≥ 10 days, ≥ 80% of commits)", () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(1 + i).padStart(2, "0")}`);
    const events = days.map((d, i) => commit({ at: wib(d, `06:0${i % 3}`) }));
    const out = run(events);
    const awarded = out.newEntries.filter((e) => e.rule === "exp.commit").map((e) => e.eventDay);
    expect(awarded).toEqual(days.slice(0, 9)); // flagged from the 10th matching day; earlier awards are kept
    expect(out.automationFlags.map((f) => f.rule)).toEqual(["clockwork", "clockwork", "clockwork"]);
  });

  it("treats automation message patterns as clockwork evidence", () => {
    const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(1 + i).padStart(2, "0")}`);
    const out = run(
      days.map((d, i) =>
        commit({ at: wib(d, `${String(8 + i).padStart(2, "0")}:00`), pattern: true }),
      ),
    );
    expect(out.automationFlags).toEqual([{ repo: "gh:1", day: "2026-10-10", rule: "clockwork" }]);
  });

  it("does not flag a normal developer with varied commit times", () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      commit({
        at: wib(
          `2026-10-${String(1 + i).padStart(2, "0")}`,
          `${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
        ),
      }),
    );
    expect(run(events).automationFlags).toEqual([]);
  });

  it("flags micro-floods (≥ 10 tiny commits on ≥ 70% of active days, median ≤ 3 lines)", () => {
    const out = run(commitsOn("2026-10-15", 12, { adds: 1, dels: 1 }));
    expect(out.automationFlags).toEqual([{ repo: "gh:1", day: "2026-10-15", rule: "micro_flood" }]);
    expect(exp(out.ledger)).toBe(0);
  });

  it("excludes declared automation and excluded repos", () => {
    const out = run(
      [commit({ at: wib("2026-10-15") }), commit({ at: wib("2026-10-15"), repo: OWN2 })],
      {
        config: { ...CONFIG, automationRepos: ["gh:1"], excludeRepos: ["Sample-Player/Beta"] },
      },
    );
    expect(out.newEntries).toEqual([]);
    expect(diag(out, "automation_declared")).toBe(1);
    expect(diag(out, "excluded_repo")).toBe(1);
  });

  it("handles large volumes: 5,000 commits a day for a week stay within caps", () => {
    const events = Array.from({ length: 7 }, (_, d) =>
      commitsOn(
        `2026-10-${String(12 + d).padStart(2, "0")}`,
        5000,
        { adds: 20 },
        `0${d}:30`,
        10_000,
      ),
    ).flat();
    const started = performance.now();
    const out = run(events);
    expect(performance.now() - started).toBeLessThan(20_000);
    expect(exp(out.ledger, "exp.commit")).toBe(7 * 75);
    const weekStars = out.ledger
      .filter((e) => e.kind === "star" && e.week === "2026-W42")
      .reduce((s, e) => s + e.amount, 0);
    expect(weekStars).toBeLessThanOrEqual(5);
  }, 60_000);
});

describe("PRs, reviews, issues and releases", () => {
  it("awards contested merges 60 and self-merges 15 (max 2 per day), PR cap 150", () => {
    const day = "2026-10-15";
    const out = run([
      pr({ mergedAt: wib(day, "09:00"), repo: EXT }),
      pr({
        mergedAt: wib(day, "09:10"),
        approvers: [{ id: 7, accountCreatedAt: "2020-01-01T00:00:00Z" }],
      }),
      pr({ mergedAt: wib(day, "09:20") }),
      pr({ mergedAt: wib(day, "09:30") }),
      pr({ mergedAt: wib(day, "09:40") }),
    ]);
    expect(out.newEntries.filter((e) => e.rule === "exp.pr").map((e) => e.amount)).toEqual([
      60, 60, 15, 15, 0,
    ]);
    const out2 = run([0, 1, 2].map((i) => pr({ mergedAt: wib(day, `10:0${i}`), repo: EXT })));
    expect(
      out2.newEntries.filter((e) => e.rule === "exp.pr").map((e) => [e.amount, e.reason ?? ""]),
    ).toEqual([
      [60, ""],
      [60, ""],
      [30, "capped"],
    ]);
  });

  it("treats approvals from accounts younger than 30 days as not contested", () => {
    const out = run([
      pr({
        mergedAt: wib("2026-10-15"),
        approvers: [{ id: 9, accountCreatedAt: "2026-10-01T00:00:00Z" }],
      }),
    ]);
    expect(out.newEntries.find((e) => e.rule === "exp.pr")?.amount).toBe(15);
  });

  it("never rewards unmerged PRs or PRs by others", () => {
    expect(
      run([pr({ mergedAt: null }), pr({ mergedAt: wib("2026-10-15"), authorIsPlayer: false })])
        .newEntries,
    ).toEqual([]);
  });

  it("awards reviews 25 (cap 100) only for substantive reviews of human PRs", () => {
    const at = (m: number) => wib("2026-10-15", `09:${String(m).padStart(2, "0")}`);
    const out = run([
      review({ at: at(1) }),
      review({ at: at(2), state: "CHANGES_REQUESTED" }),
      review({ at: at(3), state: "COMMENTED", hasBody: true }),
      review({ at: at(4), state: "COMMENTED", hasBody: false }),
      review({ at: at(5), prAuthor: BOT }),
      review({ at: at(6), prAuthor: null }),
      review({ at: at(7) }),
      review({ at: at(8) }),
    ]);
    expect(out.newEntries.filter((e) => e.rule === "exp.review").map((e) => e.amount)).toEqual([
      25, 25, 25, 25, 0,
    ]);
    expect(diag(out, "review_not_qualifying")).toBe(2);
    expect(diag(out, "missing_actor")).toBe(1);
  });

  it("awards issues opened (after 24 h settling) and resolved, once each (STK-4)", () => {
    const created = wib("2026-10-20", "09:00");
    const settling = run([issue({ createdAt: wib("2026-10-24", "09:00") })]);
    expect(settling.newEntries).toEqual([]);
    const out = run([
      issue({ createdAt: created, closedAt: wib("2026-10-21", "09:00") }),
      issue({
        createdAt: created,
        closedAt: wib("2026-10-20", "12:00"),
        stateReason: "NOT_PLANNED",
      }),
    ]);
    expect(out.newEntries.filter((e) => e.kind === "exp").map((e) => [e.rule, e.amount])).toEqual([
      ["exp.issue_opened", 10],
      ["exp.issue_resolved", 15],
    ]);
  });

  it("requires ≥ 3 qualifying commits since the previous release and a 7-day cooldown", () => {
    const commits = commitsOn("2026-10-10", 3);
    const out = run([
      ...commits,
      release({ at: wib("2026-10-11") }),
      release({ at: wib("2026-10-12"), pre: true }),
      ...commitsOn("2026-10-13", 3, { repo: OWN2 }),
      release({ at: wib("2026-10-14"), repo: OWN2, pre: true }),
    ]);
    expect(out.newEntries.filter((e) => e.rule === "exp.release").map((e) => e.amount)).toEqual([
      50, 20,
    ]);
    expect(out.diagnostics.find((d) => d.code === "release_too_few_commits")?.count).toBe(1);
  });

  it("awards 4 EXP per new private contribution, never twice, capped at 200 per week", () => {
    const first = run([privateCount("2026-01-01T00:00:00Z", "2026-10-20T00:00:00Z", 12)]);
    expect(first.newEntries.filter((e) => e.rule === "exp.private").map((e) => e.amount)).toEqual([
      48,
    ]);
    const second = run(
      [
        privateCount("2026-01-01T00:00:00Z", "2026-10-20T00:00:00Z", 12),
        privateCount("2026-01-01T00:00:00Z", "2026-10-21T00:00:00Z", 15),
      ],
      { ledger: first.ledger },
    );
    expect(second.newEntries.filter((e) => e.rule === "exp.private").map((e) => e.amount)).toEqual([
      12,
    ]);
    const big = run([privateCount("2026-01-01T00:00:00Z", "2026-10-20T00:00:00Z", 300)]);
    expect(big.newEntries.find((e) => e.rule === "exp.private")).toMatchObject({
      amount: 200,
      reason: "weekly_cap",
    });
    const lower = run([privateCount("2026-01-01T00:00:00Z", "2026-10-22T00:00:00Z", 5)], {
      ledger: first.ledger,
    });
    expect(lower.newEntries.filter((e) => e.rule === "exp.private")).toEqual([]);
  });

  it("gives no EXP for workflow runs (repeated runs cannot farm)", () => {
    const runEvent = {
      key: "run:gh:1:1",
      type: "workflow_run" as const,
      rev: 1,
      repo: OWN,
      actor: { id: 1000001, kind: "user" as const, isPlayer: true },
      occurredAt: wib("2026-10-15"),
      firstSeenAt: wib("2026-10-15"),
      metadata: {
        event: "push",
        status: "completed",
        conclusion: "success",
        createdAt: wib("2026-10-15"),
        actorIsPlayer: true,
        triggeredByPlayer: true,
        actorKind: "user" as const,
      },
      provenance: {
        sources: ["workflowRuns" as const],
        api: "rest" as const,
        collectorVersion: "1",
      },
      verification: { status: "verified" as const, notes: [] },
    };
    expect(
      run([runEvent, { ...runEvent, key: "run:gh:1:2" }, { ...runEvent, key: "run:gh:1:3" }])
        .newEntries,
    ).toEqual([]);
  });

  it("does not let a human-free review farm work through bot-authored PRs", () => {
    expect(
      run([
        review({ at: wib("2026-10-15"), prAuthor: HUMAN(5, "2026-10-14T00:00:00Z") }),
      ]).newEntries.filter((e) => e.rule === "objective.peer_review"),
    ).toEqual([]);
  });
});
