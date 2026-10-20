import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/core/hash.ts";
import { type EngineInput, runEngine } from "../../src/engine/engine.ts";
import type { Attribution, CommitCredit, RepoFacts } from "../../src/engine/heroes/attribution.ts";
import {
  HEROES,
  heroForLanguage,
  MASTERY_CAPTION,
  MASTERY_TIERS,
  masteryTierFor,
  ROLES,
  unknownSpiritId,
} from "../../src/engine/heroes/catalog.ts";
import { evaluateHeroes } from "../../src/engine/heroes/mastery.ts";
import { heroCard, heroCollection, heroLineup } from "../../src/engine/heroes/presentation.ts";
import { LedgerIndex } from "../../src/engine/ledger.ts";
import { Diagnostics } from "../../src/engine/qualify.ts";
import type { RepoRef } from "../../src/normalize/event.ts";
import {
  type AnyEvent,
  CONFIG,
  commitsOn,
  FORK,
  OWN,
  OWN2,
  resetCounter,
  snapshot,
} from "../helpers/events.ts";

const doc = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../docs/${path}`, import.meta.url)), "utf8");
const RUN = "2026-10-25T00:00:00Z";
const run = (events: AnyEvent[], extra: Partial<EngineInput> = {}) =>
  runEngine({ config: CONFIG, events, ledger: [], runAt: RUN, closureAllowed: true, ...extra });

beforeEach(resetCounter);

// ------------------------------------------------------------------ synthetic attribution for threshold tests
function facts(
  repo: RepoRef,
  commits: number,
  languages: Record<string, number> | null,
): RepoFacts {
  return {
    repo,
    qualifyingCommits: commits,
    latestLanguages: languages,
    latestTopics: [],
    markerPaths: null,
    markersObservedOn: null,
  };
}
function credit(
  repo: RepoRef,
  exp: number,
  languages: Record<string, number> | null,
  approximate = false,
): CommitCredit {
  const total = languages ? Object.values(languages).reduce((s, b) => s + b, 0) : 0;
  return {
    entryId: `exp.commit|c${exp}-${repo.id}`,
    repo,
    exp,
    eventDay: "2026-10-15",
    languages: total > 0 ? languages : null,
    totalBytes: total,
    approximate,
  };
}
function heroes(
  attribution: Attribution,
  ledger = new LedgerIndex([]),
  config?: { main?: string; hide?: string[] },
) {
  const d = new Diagnostics();
  return {
    states: evaluateHeroes(attribution, ledger, config, "1.0.0", RUN, "Asia/Jakarta", d),
    ledger,
    diagnostics: d.summary(),
  };
}
const TS = { TypeScript: 1000 };

describe("hero catalog (GDD §C.2, tables §4)", () => {
  it("matches the approved roster table exactly", () => {
    const gdd = doc("game-design/game-design-document.md");
    const table = gdd.slice(gdd.indexOf("### C.2 Hero roster v1"), gdd.indexOf("### C.3"));
    const rows = table
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.startsWith("| Hero") && !l.startsWith("| ---"));
    expect(rows).toHaveLength(HEROES.length);
    for (const row of rows) {
      const [name, epithet, , role] = row
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      const hero = HEROES.find((h) => h.name === name);
      expect(hero, name).toBeDefined();
      expect(hero?.epithet).toBe(epithet);
      expect(ROLES.find((r) => r.id === hero?.role)?.name).toBe(role);
    }
  });

  it("has stable unique ids, monograms and complete metadata", () => {
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.monogram)).size).toBe(HEROES.length);
    for (const h of HEROES) {
      expect(h.id).toMatch(/^[a-z]+$/);
      expect(h.description.length).toBeGreaterThan(20);
      expect(h.accent).toMatch(/^#[0-9A-F]{6}$/);
      expect(h.languages.length).toBeGreaterThan(0);
    }
    expect(new Set(HEROES.map((h) => h.role))).toEqual(new Set(ROLES.map((r) => r.id)));
  });

  it("matches the mastery tier table §4", () => {
    const tables = doc("game-design/progression-tables.md");
    const section = tables.slice(tables.indexOf("## 4. Hero mastery"), tables.indexOf("## 5."));
    const rows = section
      .split("\n")
      .filter((l) => /^\| (Novice|Adept|Veteran|Expert|Virtuoso|Exalted) /.test(l));
    expect(
      rows.map((r) =>
        r
          .split("|")
          .slice(1, 4)
          .map((c) => c.trim()),
      ),
    ).toEqual(
      MASTERY_TIERS.map((t) => [
        t.name,
        t.id === "novice" ? "100 (hero unlock)" : t.mp.toLocaleString("en-US"),
        t.id === "novice" ? "50 (unlock)" : String(t.bp),
      ]),
    );
  });

  it("maps aliases and gives unknown technologies a stable Unknown Spirit id", () => {
    expect(heroForLanguage("PLpgSQL")?.id).toBe("ledgera");
    expect(heroForLanguage("typescript")?.id).toBe("syntaria");
    expect(heroForLanguage("Haskell")).toBeUndefined();
    expect(unknownSpiritId("F#")).toBe("unknown:fsharp");
    expect(unknownSpiritId("Objective-C++")).toBe("unknown:objective-cplusplus");
  });
});

describe("unlock conditions (GDD §C.3)", () => {
  it("stays discovered at 99 MP and unlocks at 100 MP with a qualifying repo", () => {
    const below = heroes({
      credits: [credit(OWN, 99, TS)],
      repos: new Map([[OWN.id, facts(OWN, 5, TS)]]),
    });
    expect(below.states.find((s) => s.id === "syntaria")).toMatchObject({
      state: "discovered",
      mp: 99,
      tier: null,
    });
    const at = heroes({
      credits: [credit(OWN, 100, TS)],
      repos: new Map([[OWN.id, facts(OWN, 5, TS)]]),
    });
    expect(at.states.find((s) => s.id === "syntaria")).toMatchObject({
      state: "unlocked",
      mp: 100,
      tier: "novice",
    });
    expect(at.ledger.entries.map((e) => [e.id, e.amount])).toEqual([
      ["unlock.hero|syntaria", 0],
      ["bp.hero_unlock|syntaria", 50],
    ]);
  });

  it("requires ≥ 5 qualifying commits in a repo with ≥ 10% share", () => {
    const fewCommits = heroes({
      credits: [credit(OWN, 500, TS)],
      repos: new Map([[OWN.id, facts(OWN, 4, TS)]]),
    });
    expect(fewCommits.states.find((s) => s.id === "syntaria")?.state).toBe("discovered");
    const mixed = { TypeScript: 9, PHP: 91 };
    const lowShare = heroes({
      credits: [credit(OWN, 5000, mixed)],
      repos: new Map([[OWN.id, facts(OWN, 50, mixed)]]),
    });
    expect(lowShare.states.find((s) => s.id === "syntaria")).toMatchObject({
      state: "discovered",
      mp: 450,
    });
    expect(lowShare.states.find((s) => s.id === "orrin")).toMatchObject({
      state: "unlocked",
      mp: 4550,
      tier: "veteran",
    });
  });

  it("keeps unlocks permanent when the evidence later disappears", () => {
    const first = heroes({
      credits: [credit(OWN, 100, TS)],
      repos: new Map([[OWN.id, facts(OWN, 5, TS)]]),
    });
    const later = heroes({ credits: [], repos: new Map() }, first.ledger);
    expect(later.states.find((s) => s.id === "syntaria")).toMatchObject({
      state: "unlocked",
      tier: "novice",
    });
    expect(later.ledger.entries).toHaveLength(2);
  });
});

describe("mastery thresholds and history", () => {
  it.each(MASTERY_TIERS.map((t) => [t.name, t.mp]))("%s starts exactly at %i MP", (_, mp) => {
    const at = heroes({
      credits: [credit(OWN, mp, TS)],
      repos: new Map([[OWN.id, facts(OWN, 5, TS)]]),
    }).states.find((s) => s.id === "syntaria");
    expect(at?.tier).toBe(masteryTierFor(mp)?.id);
    const before = heroes({
      credits: [credit(OWN, mp - 1, TS)],
      repos: new Map([[OWN.id, facts(OWN, 5, TS)]]),
    }).states.find((s) => s.id === "syntaria");
    expect(before?.tier).toBe(mp === 100 ? null : masteryTierFor(mp - 1)?.id);
  });

  it("records every tier crossed once, with its BP, in order", () => {
    const out = heroes({
      credits: [credit(OWN, 50_000, TS)],
      repos: new Map([[OWN.id, facts(OWN, 5, TS)]]),
    });
    expect(
      out.ledger.entries
        .filter((e) => e.kind === "bp")
        .map((e) => [e.rule, e.meta?.tier ?? "unlock", e.amount]),
    ).toEqual([
      ["bp.hero_unlock", "unlock", 50],
      ["bp.mastery", "adept", 30],
      ["bp.mastery", "veteran", 60],
      ["bp.mastery", "expert", 120],
      ["bp.mastery", "virtuoso", 250],
      ["bp.mastery", "exalted", 500],
    ]);
    expect(out.states.find((s) => s.id === "syntaria")?.tierHistory.map((h) => h.tier)).toEqual([
      "novice",
      "adept",
      "veteran",
      "expert",
      "virtuoso",
      "exalted",
    ]);
  });

  it("splits ambiguous multi-language repos by byte share (integer maths, never above total EXP)", () => {
    const mixed = { TypeScript: 600, Python: 300, Shell: 100 };
    const out = heroes({
      credits: [credit(OWN, 1000, mixed)],
      repos: new Map([[OWN.id, facts(OWN, 5, mixed)]]),
    });
    const mp = Object.fromEntries(out.states.filter((s) => s.mp > 0).map((s) => [s.id, s.mp]));
    expect(mp).toEqual({ syntaria: 600, pytha: 300, basalt: 100 });
  });

  it("marks MP from awards older than the first language snapshot as approximate", () => {
    const out = heroes({
      credits: [credit(OWN, 200, TS, true)],
      repos: new Map([[OWN.id, facts(OWN, 5, TS)]]),
    });
    expect(out.states.find((s) => s.id === "syntaria")?.approximate).toBe(true);
  });

  it("tracks unknown technologies as Unknown Spirits without rewards", () => {
    const hs = { Haskell: 1000 };
    const out = heroes({
      credits: [credit(OWN, 500, hs)],
      repos: new Map([[OWN.id, facts(OWN, 9, hs)]]),
    });
    expect(out.states.find((s) => s.id === "unknown:haskell")).toMatchObject({
      kind: "unknown_spirit",
      state: "discovered",
      mp: 500,
    });
    expect(out.ledger.entries).toEqual([]);
    expect(heroCard(out.states.find((s) => s.id === "unknown:haskell") as never)).toMatchObject({
      name: "Unknown Spirit (Haskell)",
      role: { id: null },
    });
  });
});

describe("hero mastery through the engine", () => {
  it("credits only qualified commit EXP, using the snapshot from award time", () => {
    const first = run([
      ...commitsOn("2026-10-15", 10),
      snapshot(OWN, "2026-10-14", { TypeScript: 1000 }),
    ]);
    expect(first.specialization.heroes.find((h) => h.id === "syntaria")?.mp).toBe(75);
    // Later the repo is rewritten in PHP: past awards keep TypeScript credit; new awards follow PHP.
    const second = run(
      [
        ...commitsOn("2026-10-15", 10),
        snapshot(OWN, "2026-10-14", { TypeScript: 1000 }),
        snapshot(OWN, "2026-10-26", { PHP: 1000 }),
        ...commitsOn("2026-10-27", 10, {}, "14:00"),
      ],
      {
        ledger: first.ledger,
        runAt: "2026-10-28T00:00:00Z",
      },
    );
    const mp = Object.fromEntries(
      second.specialization.heroes.filter((h) => h.mp > 0).map((h) => [h.id, h.mp]),
    );
    expect(mp).toEqual({ syntaria: 75, orrin: 75 });
  });

  it("ignores forks, private repos and repos without language data (reported)", () => {
    const priv: RepoRef = {
      id: "p:abc",
      visibility: "private",
      ownedByPlayer: true,
      isFork: false,
      isArchived: false,
    };
    const out = run([
      ...commitsOn("2026-10-15", 6, { repo: FORK }),
      ...commitsOn("2026-10-16", 6, { repo: priv }, "11:00"),
      ...commitsOn("2026-10-17", 6, { repo: OWN2 }, "12:00"),
      snapshot(FORK, "2026-10-14", TS),
      snapshot(priv, "2026-10-14", TS),
    ]);
    expect(out.specialization.heroes.every((h) => h.mp === 0)).toBe(true);
    expect(out.diagnostics.find((d) => d.code === "no_language_snapshot")?.examples).toEqual([
      OWN2.id,
    ]);
  });

  it("is deterministic and idempotent", () => {
    const events = [
      ...commitsOn("2026-10-15", 10),
      ...commitsOn("2026-10-16", 10, { repo: OWN2 }, "13:00"),
      snapshot(OWN, "2026-10-14", { TypeScript: 700, CSS: 300 }),
      snapshot(OWN2, "2026-10-14", { Python: 1000 }),
    ];
    const a = run(events);
    expect(canonicalJson(run([...events].reverse()))).toBe(canonicalJson(a));
    expect(run(events, { ledger: a.ledger }).newEntries).toEqual([]);
  });
});

describe("hero presentation", () => {
  const mixed = { TypeScript: 500, Python: 300, PHP: 200 };
  const states = heroes(
    { credits: [credit(OWN, 3000, mixed)], repos: new Map([[OWN.id, facts(OWN, 9, mixed)]]) },
    new LedgerIndex([]),
    { main: "pytha", hide: ["orrin"] },
  ).states;

  it("builds cards with role, icon reference, mastery indicator and the required caption", () => {
    const card = heroCard(states.find((s) => s.id === "syntaria") as never, {
      iconBasePath: "assets/x",
    });
    expect(card).toMatchObject({
      name: "Syntaria",
      technology: "TypeScript",
      role: { id: "mage", glyph: "star" },
      state: "unlocked",
      icon: { asset: "assets/x/syntaria.svg", monogram: "Sy", accent: "#3178C6" },
      mastery: {
        tier: "adept",
        mp: 1500,
        provenance: "derived",
        indicator: { percent: 25, current: 1500, next: 3000 },
      },
      caption: MASTERY_CAPTION,
    });
  });

  it("puts the configured main hero first and leaves hidden heroes out", () => {
    expect(heroLineup(states).map((c) => [c.id, c.isMain])).toEqual([
      ["pytha", true],
      ["syntaria", false],
    ]);
    const collection = heroCollection(states);
    expect(collection.roles.find((r) => r.role === "fighter")?.heroes).toEqual([]);
    expect(collection.totals).toEqual({ unlocked: 3, discovered: 0, catalog: HEROES.length });
  });

  it("falls back to the highest-MP hero when the configured main is not unlocked", () => {
    const out = heroes(
      { credits: [credit(OWN, 300, TS)], repos: new Map([[OWN.id, facts(OWN, 9, TS)]]) },
      new LedgerIndex([]),
      { main: "ferrin" },
    );
    expect(out.states.find((s) => s.isMain)?.id).toBe("syntaria");
    expect(out.diagnostics.find((d) => d.code === "main_hero_not_unlocked")?.count).toBe(1);
  });

  it("shows the unlock rule on discovered heroes instead of claiming expertise", () => {
    const out = heroes({
      credits: [credit(OWN, 50, TS)],
      repos: new Map([[OWN.id, facts(OWN, 2, TS)]]),
    });
    const card = heroCard(out.states.find((s) => s.id === "syntaria") as never);
    expect(card?.unlockHint).toMatch(/Unlocks at 100 MP/);
    expect(JSON.stringify(card)).not.toMatch(/expert in|proficient|skilled/i);
  });
});
