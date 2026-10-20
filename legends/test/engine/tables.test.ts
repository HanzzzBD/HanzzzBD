import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cumulativeExpForLevel,
  expToNextLevel,
  levelForExp,
  levelProgress,
  levelUpBp,
} from "../../src/engine/level.ts";
import { gateStars, rankFromStars, softResetStars, tierEntries } from "../../src/engine/rank.ts";
import { RULESET_V1 as R } from "../../src/engine/rules.ts";
import { isoWeek, seasonByNumber, seasonOf } from "../../src/engine/time.ts";

const doc = readFileSync(
  fileURLToPath(new URL("../../../docs/game-design/progression-tables.md", import.meta.url)),
  "utf8",
);

function section(title: string): string {
  const start = doc.indexOf(title);
  const next = doc.indexOf("\n## ", start + title.length);
  return doc.slice(start, next === -1 ? undefined : next);
}

/** Rows of the first table after the heading (header and separator excluded). */
function tableRows(text: string): string[][] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("| "));
  const rows: string[] = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith("|")) break;
    rows.push(line);
  }
  return rows.slice(2).map((l) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim()),
  );
}

const num = (s: string) => Number(s.replace(/[,★ ]/g, ""));

describe("levels match progression-tables.md §1 exactly", () => {
  const rows = tableRows(section("## 1. Player levels"));

  it("documents the levels the test relies on", () => {
    expect(rows.length).toBeGreaterThanOrEqual(44);
  });

  it.each(rows.map((r) => [r[0], r]))(
    "level %s: EXP to next, cumulative EXP, BP and title",
    (_, row) => {
      const [level, toNext, cumulative, bp, title] = row as string[];
      const n = Number(level);
      expect(cumulativeExpForLevel(n, R)).toBe(num(cumulative ?? ""));
      expect(expToNextLevel(n, R)).toBe(n === 100 ? null : num(toNext ?? ""));
      if (n >= 2) expect(levelUpBp(n, R)).toBe(num(bp ?? ""));
      if (title) expect(levelProgress(cumulativeExpForLevel(n, R), R).title).toBe(title);
    },
  );

  it("every level 2–100 starts exactly at its threshold (boundary −1 / 0)", () => {
    for (let n = 2; n <= 100; n++) {
      const t = cumulativeExpForLevel(n, R);
      expect(levelForExp(t - 1, R)).toBe(n - 1);
      expect(levelForExp(t, R)).toBe(n);
    }
  });

  it("caps at level 100 and reports overflow", () => {
    const p = levelProgress(252_450 + 1_234, R);
    expect(p).toMatchObject({
      level: 100,
      expForNext: null,
      expRemaining: null,
      overflow: 1_234,
      title: "Living Legend",
    });
    expect(levelProgress(0, R)).toMatchObject({
      level: 1,
      expIntoLevel: 0,
      expForNext: 100,
      expRemaining: 100,
      title: "Rookie",
    });
  });

  it("rejects invalid EXP values", () => {
    expect(() => levelForExp(-1, R)).toThrow();
    expect(() => levelForExp(Number.NaN, R)).toThrow();
  });
});

describe("rank ladder matches progression-tables.md §2 exactly", () => {
  const rows = tableRows(section("## 2. Rank ladder"));

  it.each(rows.map((r) => [r[0], r]))(
    "%s: divisions, stars, entries and first-time BP",
    (_, row) => {
      const [tierName, , perDivision, entries, , bp] = row as string[];
      const index = R.tiers.findIndex((t) => t.name === tierName);
      expect(index).toBeGreaterThanOrEqual(0);
      const tier = R.tiers[index];
      const entryList = (entries ?? "").split("/").map(num);
      expect(tierEntries(R)[index]).toBe(entryList[0]);
      if (tier?.divisions === 3) {
        expect((perDivision ?? "").split("/").map(num)).toEqual([
          tier.starsPerDivision,
          tier.starsPerDivision,
          tier.starsPerDivision,
        ]);
        // Every division threshold: III at entry, II and I after each division's stars.
        const labels = ["III", "II", "I"];
        entryList.forEach((stars, d) => {
          expect(rankFromStars(stars, R).label).toBe(`${tierName} ${labels[d]}`);
          if (stars > 0)
            expect(rankFromStars(stars - 1, R).label).not.toBe(`${tierName} ${labels[d]}`);
        });
      }
      expect(tier?.firstTimeBp ?? -1).toBe(bp === "—" ? 0 : num(bp ?? ""));
    },
  );

  it("maps every star count 0–200 to a single consistent rank", () => {
    let previous = -1;
    for (let s = 0; s <= 200; s++) {
      const r = rankFromStars(s, R);
      expect(r.tierIndex).toBeGreaterThanOrEqual(previous);
      previous = r.tierIndex;
      if (r.starsForDivision !== null) expect(r.starsInDivision).toBeLessThan(r.starsForDivision);
    }
    expect(rankFromStars(71, R).label).toBe("Paragon I");
    expect(rankFromStars(72, R).label).toBe("Ascendant ★0");
    expect(rankFromStars(91, R).label).toBe("Ascendant ★19");
    expect(rankFromStars(92, R).label).toBe("Eternal ★0");
    expect(rankFromStars(100, R).label).toBe("Eternal ★8");
  });

  it("matches the trial table", () => {
    expect(R.tiers.map((t) => t.trial ?? null)).toEqual([
      null,
      null,
      null,
      null,
      { objectives: 3, contested: 1 },
      { objectives: 8, contested: 3 },
      { objectives: 15, contested: 6, repos: 2 },
      { objectives: 25, contested: 10, counterparts: 3 },
    ]);
  });

  it("matches the battle results table §2.1", () => {
    expect(R.battle).toEqual({
      victoryScore: 30,
      mvpScore: 100,
      victoryBp: 15,
      mvpBp: 30,
      weeklyStarCap: 5,
    });
  });

  it("matches the soft reset table §2.2", () => {
    const rows22 = tableRows(section("### 2.2 Soft reset"));
    expect(rows22).toHaveLength(5);
    const finals: Record<string, number> = {
      Eternal: 92,
      Ascendant: 72,
      Paragon: 57,
      Champion: 42,
      Warden: 30,
      Knight: 18,
      Squire: 9,
      Initiate: 0,
    };
    for (const [final, , starting] of rows22) {
      for (const name of (final ?? "").split(",").map((s) => s.trim())) {
        expect(softResetStars(finals[name] ?? -1, R)).toBe(num(starting ?? ""));
        expect(softResetStars((finals[name] ?? 0) + 2, R)).toBe(num(starting ?? ""));
      }
    }
  });

  it("matches the season-end BP table §2.3", () => {
    const rows23 = tableRows(section("### 2.3 Season-end rewards"));
    for (const [tier, bp] of rows23)
      expect(R.tiers.find((t) => t.name === tier)?.seasonEndBp).toBe(num(bp ?? ""));
  });

  it("matches the season calendar §3", () => {
    expect(seasonByNumber(1, "2026-10-01")).toEqual({
      number: 1,
      id: "S1",
      startDay: "2026-10-01",
      endDay: "2026-12-31",
    });
    expect(seasonByNumber(4, "2026-10-01")).toMatchObject({
      startDay: "2027-07-01",
      endDay: "2027-09-30",
    });
    expect(seasonOf("2026-09-30", "2026-10-01")).toBeNull();
    expect(seasonOf("2027-01-01", "2026-10-01")?.id).toBe("S2");
  });

  it("uses ISO weeks, including 2026-W53 across the S1/S2 boundary", () => {
    expect(isoWeek("2026-12-28")).toBe("2026-W53");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
    expect(isoWeek("2026-10-19")).toBe("2026-W43");
  });
});

describe("promotion trial gating (GDD A.4)", () => {
  const none = { objectives: 0, contested: 0, repos: 0, counterparts: 0 };
  const champion = { objectives: 3, contested: 1, repos: 1, counterparts: 1 };

  it("holds at Warden I and banks stars without the Champion trial", () => {
    expect(gateStars(50, 0, none, R)).toEqual({ effective: 41, banked: 9, blockedBy: "champion" });
    expect(rankFromStars(41, R).label).toBe("Warden I");
  });

  it("releases banked stars once the trial is met, then gates the next tier", () => {
    expect(gateStars(50, 0, champion, R)).toEqual({ effective: 50, banked: 0, blockedBy: null });
    expect(gateStars(60, 0, champion, R)).toEqual({
      effective: 56,
      banked: 4,
      blockedBy: "paragon",
    });
  });

  it("does not re-gate tiers at or below the season's starting position", () => {
    expect(gateStars(50, 42, none, R)).toEqual({ effective: 50, banked: 0, blockedBy: null });
    expect(gateStars(60, 42, none, R).blockedBy).toBe("paragon");
  });

  it("requires repos for Ascendant and counterparts for Eternal", () => {
    const strong = { objectives: 30, contested: 12, repos: 1, counterparts: 2 };
    expect(gateStars(80, 0, strong, R).blockedBy).toBe("ascendant");
    expect(gateStars(95, 0, { ...strong, repos: 2 }, R).blockedBy).toBe("eternal");
    expect(gateStars(95, 0, { ...strong, repos: 2, counterparts: 3 }, R).blockedBy).toBeNull();
  });
});
