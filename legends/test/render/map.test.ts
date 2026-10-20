import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { runEngine } from "../../src/engine/engine.ts";
import { cumulativeExpForLevel } from "../../src/engine/level.ts";
import { RULESET_V1 } from "../../src/engine/rules.ts";
import { MAIN_REGION_IDS, MOTIFS, REGIONS, regionDef } from "../../src/render/map/catalog.ts";
import { MOTIF_IDS } from "../../src/render/map/glyphs.ts";
import { rankText } from "../../src/render/map/rank.ts";
import { renderMap } from "../../src/render/map/render.ts";
import { type MapState, MapStateError, parseMapState } from "../../src/render/map/schema.ts";
import { buildMapState, type MapFacts, mapStateFromFacts } from "../../src/render/map/state.ts";
import {
  AssetPathError,
  escapeMarkdown,
  mapAltText,
  mapEmbed,
  regionList,
} from "../../src/render/map/text.ts";
import { DARK, LIGHT, THEMES } from "../../src/render/tokens.ts";
import { overlapIssues, parseSvg, validateSvg } from "../../src/render/validate.ts";
import {
  HOSTILE_NAME,
  LEGEND,
  LONG_NAME,
  MID_JOURNEY,
  NEW_PLAYER,
  THRONE_CURRENT,
  UNICODE_NAME,
} from "../fixtures/map-facts.ts";
import { CONFIG, commitsOn, resetCounter } from "../helpers/events.ts";

const state = (
  facts: MapFacts,
  name = "Sample Player",
  extra: { sample?: boolean; stale?: boolean } = {},
) => mapStateFromFacts(facts, { name, ...extra });
const region = (s: MapState, id: string) => s.regions.find((r) => r.id === id);
const check = (svg: string, theme = DARK) =>
  validateSvg(svg, { theme, width: 420, height: 820, maxBytes: 100_000 });
const ALL_FIXTURES: Array<[string, MapState]> = [
  ["new", state(NEW_PLAYER)],
  ["mid", state(MID_JOURNEY, "Ayu Lestari", { sample: true })],
  ["throne", state(THRONE_CURRENT, UNICODE_NAME)],
  ["legend", state(LEGEND, LONG_NAME, { stale: true, sample: true })],
  ["hostile", state(MID_JOURNEY, HOSTILE_NAME)],
];

beforeEach(resetCounter);

describe("map catalog", () => {
  it("has 6 main and 7 domain regions with 3 checkpoints each, matching GDD §J.2 gates", () => {
    expect(REGIONS.filter((r) => r.kind === "main").map((r) => [r.name, r.gateLevel])).toEqual([
      ["Starter Village", 1],
      ["Forest of Branches", 5],
      ["River of Reviews", 10],
      ["Citadel of Releases", 20],
      ["Peaks of Mastery", 35],
      ["Throne of Eternity", 50],
    ]);
    expect(REGIONS.filter((r) => r.kind === "domain")).toHaveLength(7);
    for (const r of REGIONS) expect(r.checkpoints).toHaveLength(3);
  });

  it("uses the slot table from map-specification §2.1", () => {
    const slots = Object.fromEntries(REGIONS.map((r) => [r.id, [r.x, r.y]]));
    expect(slots).toMatchObject({
      village: [240, 688],
      throne: [180, 112],
      observatory: [350, 350],
      commons: [346, 156],
    });
  });

  it("references only glyphs that exist", () => {
    expect([...MOTIF_IDS].sort()).toEqual([...MOTIFS].sort());
    for (const r of REGIONS) expect(MOTIF_IDS).toContain(r.motif);
  });
});

describe("map data schema", () => {
  const valid = state(MID_JOURNEY);

  it("accepts derived state and rejects anything outside the schema", () => {
    expect(parseMapState(valid)).toEqual(valid);
    const bad: unknown[] = [
      { ...valid, extra: 1 },
      { ...valid, version: 2 },
      { ...valid, player: { ...valid.player, level: 1.5 } },
      { ...valid, player: { ...valid.player, name: "a\u202Eb" } },
      { ...valid, regions: valid.regions.map((r, i) => (i === 0 ? { ...r, id: "atlantis" } : r)) },
      {
        ...valid,
        regions: valid.regions.map((r, i) =>
          i === 0 ? { ...r, checkpoints: [...r.checkpoints].reverse() } : r,
        ),
      },
      {
        ...valid,
        regions: valid.regions.map((r) =>
          r.id === "village" ? { ...r, state: "hidden", missing: null } : r,
        ),
      },
      {
        ...valid,
        regions: valid.regions.map((r) => (r.id === "forest" ? { ...r, state: "current" } : r)),
      },
      { ...valid, progress: { ...valid.progress, percent: 140 } },
      { ...valid, asOf: "yesterday" },
    ];
    for (const input of bad) expect(() => parseMapState(input)).toThrow(MapStateError);
  });

  it("never echoes invalid values in error messages", () => {
    try {
      parseMapState({ ...valid, player: { ...valid.player, name: "<script>\u202E" } });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("<script>");
    }
  });
});

describe("map state rules", () => {
  it("starts a new player at Starter Village with everything else fogged or hidden", () => {
    const s = state(NEW_PLAYER);
    expect(s.current).toBe("village");
    expect(region(s, "village")?.state).toBe("current");
    for (const id of ["forest", "river", "citadel", "peaks", "throne"])
      expect(region(s, id)).toMatchObject({ state: "locked", missing: "level" });
    for (const r of REGIONS.filter((d) => d.kind === "domain"))
      expect(region(s, r.id)?.state).toBe("hidden");
    expect(s.next).toEqual({ kind: "checkpoint", region: "village", checkpoint: "first-commit" });
    expect(region(s, "village")?.checkpoints[0]?.status).toBe("next");
    expect(s.progress).toMatchObject({ kind: "level", percent: 0 });
  });

  it("unlocks main regions at their level gates and puts the marker on the highest one", () => {
    for (const def of MAIN_REGION_IDS.map(regionDef)) {
      const at = state({
        ...NEW_PLAYER,
        level: def.gateLevel,
        exp: cumulativeExpForLevel(def.gateLevel, RULESET_V1),
      });
      // Spec §5: once all six are unlocked, the marker goes to the lowest unfinished region.
      expect(at.current).toBe(def.id === "throne" ? "village" : def.id);
      expect(region(at, def.id)?.state).not.toBe("locked");
      if (def.gateLevel > 1) {
        const below = state({ ...NEW_PLAYER, level: def.gateLevel - 1 });
        expect(region(below, def.id)?.state).toBe("locked");
      }
    }
  });

  it("applies domain gates: hidden at 0 EP, then emblem level 1, then player level 10", () => {
    const base = { ...MID_JOURNEY };
    expect(
      region(state({ ...base, emblems: { database: { ep: 0, level: 0 } } }), "vault")?.state,
    ).toBe("hidden");
    expect(
      region(state({ ...base, emblems: { database: { ep: 5, level: 0 } } }), "vault"),
    ).toMatchObject({ state: "locked", missing: "emblem" });
    expect(
      region(state({ ...base, level: 9, emblems: { database: { ep: 50, level: 1 } } }), "vault"),
    ).toMatchObject({ state: "locked", missing: "level" });
    expect(
      region(state({ ...base, emblems: { database: { ep: 50, level: 1 } } }), "vault")?.state,
    ).toBe("unlocked");
  });

  it("keeps checkpoints cleared before their region unlocks", () => {
    const s = state(MID_JOURNEY);
    expect(region(s, "citadel")?.state).toBe("locked");
    expect(region(s, "citadel")?.checkpoints[0]).toEqual({
      id: "first-release",
      status: "cleared",
      clearedOn: "2026-10-25",
    });
  });

  it("points to the next gate when only an unavailable checkpoint is left", () => {
    const s = state(MID_JOURNEY);
    expect(s.current).toBe("river");
    expect(region(s, "river")?.checkpoints[2]?.status).toBe("unavailable");
    expect(s.next).toEqual({ kind: "gate", region: "citadel", level: 20 });
  });

  it("does not let an unavailable checkpoint hold the marker back once everything is unlocked", () => {
    const s = state(LEGEND);
    expect(s.current).toBe("throne");
    expect(region(s, "throne")?.state).toBe("completed");
    expect(region(s, "river")?.state).toBe("unlocked");
    expect(s.next).toEqual({ kind: "done" });
    expect(s.progress).toEqual({ kind: "checkpoints", current: 17, target: 17, percent: 100 });
  });

  it("measures progress toward the next region from EXP between the two gates", () => {
    const from = cumulativeExpForLevel(10, RULESET_V1);
    const to = cumulativeExpForLevel(20, RULESET_V1);
    const s = state(MID_JOURNEY);
    expect(s.progress).toEqual({
      kind: "level",
      current: MID_JOURNEY.exp - from,
      target: to - from,
      percent: Math.floor(((MID_JOURNEY.exp - from) * 100) / (to - from)),
    });
  });

  it("sanitises the player name and drops emoji", () => {
    expect(state(NEW_PLAYER, "  Ayu\u202E 🐉 Lestari\n").player).toMatchObject({
      name: "Ayu Lestari",
      initials: "AL",
    });
    expect(state(NEW_PLAYER, "\u0000\u202E").player.name).toBe("Player");
  });
});

describe("map state from a real engine run", () => {
  const events = [...commitsOn("2026-10-05", 3), ...commitsOn("2026-10-06", 3)];
  const run = (runAt: string, extra = events) =>
    runEngine({ config: CONFIG, events: extra, ledger: [], runAt, closureAllowed: true });

  it("clears checkpoints from ledger evidence with their earned-on dates", () => {
    const s = buildMapState(run("2026-10-20T00:00:00Z"), { name: "Sample Player" });
    expect(region(s, "village")?.checkpoints.slice(0, 2)).toEqual([
      { id: "first-commit", status: "cleared", clearedOn: "2026-10-05" },
      { id: "first-victory", status: "cleared", clearedOn: "2026-10-05" },
    ]);
    expect(s.asOf).toBe("2026-10-20");
    expect(s.rank).toEqual({ tier: "initiate", division: 3, stars: 2 });
  });

  it("never un-clears a checkpoint or re-locks a region on later runs", () => {
    const first = run("2026-10-20T00:00:00Z");
    const later = runEngine({
      config: CONFIG,
      events,
      ledger: first.ledger,
      runAt: "2026-12-01T00:00:00Z",
      closureAllowed: true,
    });
    const a = buildMapState(first, { name: "P" });
    const b = buildMapState(later, { name: "P" });
    for (const r of a.regions) {
      const after = region(b, r.id);
      r.checkpoints.forEach((c, i) => {
        if (c.status === "cleared") expect(after?.checkpoints[i]?.status).toBe("cleared");
      });
      if (r.state !== "locked" && r.state !== "hidden") expect(after?.state).not.toBe("locked");
    }
  });
});

describe("map renderer", () => {
  it("is deterministic: identical input gives byte-identical SVG", () => {
    for (const [, s] of ALL_FIXTURES)
      expect(renderMap(s, DARK).svg).toBe(renderMap(structuredClone(s), DARK).svg);
  });

  it("passes the SVG validator and the overlap lint for every fixture in both themes", () => {
    for (const [name, s] of ALL_FIXTURES)
      for (const theme of [DARK, LIGHT]) {
        const { svg, boxes } = renderMap(s, theme);
        expect([name, theme.id, check(svg, theme)]).toEqual([name, theme.id, []]);
        expect([name, theme.id, overlapIssues(boxes)]).toEqual([name, theme.id, []]);
        expect(Buffer.byteLength(svg)).toBeLessThan(100_000);
      }
  });

  it("keeps every layout clear when any main region is current and every domain is visible", () => {
    const emblems = Object.fromEntries(
      ["frontend", "backend", "fullstack", "ai_ml", "devops", "database", "open_source"].map(
        (e) => [e, { ep: 10, level: 1 }],
      ),
    );
    for (const def of MAIN_REGION_IDS.map(regionDef)) {
      const level = Math.max(def.gateLevel, 10);
      const facts: MapFacts = {
        ...NEW_PLAYER,
        level,
        exp: cumulativeExpForLevel(level, RULESET_V1),
        emblems,
        activeQuests: 128,
      };
      const s = state(facts, LONG_NAME, { sample: true, stale: true });
      if (def.gateLevel >= 10 && def.id !== "throne") expect(s.current).toBe(def.id);
      const { svg, boxes } = renderMap(s, DARK);
      expect([def.id, overlapIssues(boxes)]).toEqual([def.id, []]);
      expect([def.id, check(svg)]).toEqual([def.id, []]);
    }
  });

  it("escapes a hostile player name and strips bidi overrides", () => {
    const { svg } = renderMap(state(MID_JOURNEY, HOSTILE_NAME), DARK);
    expect(svg).not.toMatch(/<script|<a |\u202E/);
    expect(svg).toContain("&lt;/text&gt;&lt;script&gt;");
    const tags = new Set<string>();
    const walk = (n: ReturnType<typeof parseSvg>) => {
      tags.add(n.tag);
      for (const c of n.children) if (typeof c !== "string") walk(c);
    };
    walk(parseSvg(svg));
    expect(
      [...tags].filter((t) => ["script", "a", "foreignObject", "image", "use"].includes(t)),
    ).toEqual([]);
    expect(check(svg)).toEqual([]);
  });

  it("truncates long names inside the title band and formats large values", () => {
    const { svg } = renderMap(state(LEGEND, LONG_NAME), DARK);
    expect(svg).not.toContain(LONG_NAME);
    expect(svg).toMatch(/>Sir Barthol[^<]*…</);
    expect(svg).toContain("· Lv 1,250");
    expect(svg).toContain(">Eternal 12.3K<");
    expect(svg).toContain(">99+<");
    expect(check(svg).filter((i) => i.code === "text_bounds")).toEqual([]);
  });

  it("draws region states as specified: hidden not drawn, locked fogged with a gate, current marked", () => {
    const { svg } = renderMap(state(MID_JOURNEY), DARK);
    expect(svg).not.toContain('id="region-vault"');
    expect(svg).toContain('id="region-harbor"');
    expect(svg).toMatch(/id="region-citadel"><rect[^>]*fill="url\(#fog\)"/);
    expect(svg).toContain(">Unlocks at Lv 20<");
    expect(svg).toContain(">DevOps L1<");
    expect(svg).toContain('id="player-marker"');
    expect(svg).toContain(">Next: Citadel of Releases at Lv 20<");
    expect(svg).toContain('id="quest-marker"');
    expect(svg).toContain(">Champion II<");
  });

  it("shows the quest marker only with active quests, and watermarks sample or stale data", () => {
    const quiet = renderMap(state({ ...MID_JOURNEY, activeQuests: 0 }), DARK).svg;
    expect(quiet).not.toContain("quest-marker");
    expect(quiet).not.toContain("SAMPLE DATA");
    expect(quiet).not.toContain("Stale data");
    const flagged = renderMap(state(MID_JOURNEY, "P", { sample: true, stale: true }), DARK).svg;
    expect(flagged).toContain(">SAMPLE DATA<");
    expect(flagged).toContain(">Stale data<");
    expect(flagged).toContain("World map: The Realms (sample data)");
  });

  it("renders rank text for every tier shape", () => {
    expect(rankText(null).label).toBe("Unranked");
    expect(rankText({ tier: "paragon", division: 1, stars: 2 }).label).toBe("Paragon I");
    expect(rankText({ tier: "ascendant", division: null, stars: 6 })).toEqual({
      label: "Ascendant 6",
      starred: true,
    });
  });

  it("refuses unvalidated state", () => {
    const s = state(MID_JOURNEY);
    expect(() => renderMap({ ...s, current: "atlantis" } as unknown as MapState, DARK)).toThrow(
      MapStateError,
    );
  });

  it("is well-formed XML for an independent parser (xmllint), when available", () => {
    const xmllint = ["/usr/bin/xmllint", "/usr/local/bin/xmllint"].find(existsSync);
    if (!xmllint) return;
    const dir = mkdtempSync(join(tmpdir(), "legends-map-"));
    for (const [name, s] of ALL_FIXTURES) {
      const file = join(dir, `${name}.svg`);
      writeFileSync(file, renderMap(s, LIGHT).svg);
      expect(() =>
        execFileSync(xmllint, ["--noout", "--nonet", file], { stdio: "pipe" }),
      ).not.toThrow();
    }
  });
});

describe("text fallback", () => {
  it("writes alt text of at most 600 characters ending with a pointer to the list", () => {
    for (const [, s] of ALL_FIXTURES) {
      const alt = mapAltText(s);
      expect(alt.length).toBeLessThanOrEqual(600);
      expect(alt.endsWith("Full region list below.")).toBe(true);
    }
  });

  it("lists every visible region with status and progress, omitting hidden ones", () => {
    const list = regionList(state(MID_JOURNEY));
    expect(list).toContain(
      "| River of Reviews | 📍 Current | 2/3 (First verified ally not available yet) |",
    );
    expect(list).toContain("| Citadel of Releases | 🔒 Lv 20 | 1/3 |");
    expect(list).toContain("| Harbor of Pipelines · DevOps | 🔒 DevOps L1 | 0/3 |");
    expect(list).not.toContain("Vault of Records");
    expect(list).toContain(
      "**Upcoming:** Citadel of Releases at Lv 20 · Peaks of Mastery at Lv 35",
    );
  });

  it("escapes Markdown and HTML", () => {
    expect(escapeMarkdown("<img src=x>[a](b)|*_`")).toBe(
      "&lt;img src=x&gt;\\[a\\]\\(b\\)\\|\\*\\_\\`",
    );
  });

  it("embeds both themes with validated asset paths and an escaped alt attribute", () => {
    const s = state(MID_JOURNEY, 'Quote " Name');
    const block = mapEmbed(s, {
      dark: "assets/legends/dark/world-map.svg",
      light: "assets/legends/light/world-map.svg",
    });
    expect(block).toContain(
      '<source media="(prefers-color-scheme: light)" srcset="assets/legends/light/world-map.svg">',
    );
    expect(block).toContain('alt="Quote &quot; Name, level 14');
    expect(block).toMatch(
      /^<details>\n<summary><b>🗺 World map<\/b>: River of Reviews \(2\/3\)<\/summary>/,
    );
    for (const bad of [
      "../secrets.svg",
      "https://evil.example/x.svg",
      "javascript:alert(1)",
      "x.svg?a=b",
      "/abs/x.svg",
      "x.png",
      "a//b.svg",
    ])
      expect(() => mapEmbed(s, { dark: bad, light: "ok.svg" })).toThrow(AssetPathError);
  });
});

describe("example preview", () => {
  it("is in sync with the renderer (regenerate with node scripts/preview-map.ts)", () => {
    const dir = fileURLToPath(new URL("../../preview/world-map/", import.meta.url));
    const s = state(MID_JOURNEY, "Ayu Lestari", { sample: true });
    for (const theme of Object.values(THEMES))
      expect(readFileSync(`${dir}mid-journey.${theme.id}.svg`, "utf8")).toBe(
        renderMap(s, theme).svg,
      );
  });
});
