/**
 * Sample map facts (SAMPLE DATA). Names are invented; no real account is referenced.
 */
import type { CheckpointFact, MapFacts } from "../../src/render/map/state.ts";

const done = (on: string | null = "2026-10-05") => ({ cleared: true, on });
const ally = { "first-ally": { cleared: false, on: null, unavailable: true } };

export const NEW_PLAYER: MapFacts = {
  asOf: "2026-10-20",
  level: 1,
  exp: 0,
  rank: { tier: "initiate", division: 3, stars: 0 },
  emblems: {},
  checkpoints: { ...ally },
  activeQuests: 3,
};

/** Close to the approved mockup: River of Reviews current at 2/3, mixed domain regions. */
export const MID_JOURNEY: MapFacts = {
  asOf: "2026-11-20",
  level: 14,
  exp: 6_200,
  rank: { tier: "champion", division: 2, stars: 3 },
  emblems: {
    backend: { ep: 900, level: 4 },
    frontend: { ep: 300, level: 2 },
    fullstack: { ep: 250, level: 1 },
    ai_ml: { ep: 120, level: 1 },
    devops: { ep: 40, level: 0 },
    open_source: { ep: 10, level: 0 },
  },
  checkpoints: {
    ...ally,
    "first-commit": done("2026-10-01"),
    "first-victory": done("2026-10-01"),
    "first-hero": done("2026-10-03"),
    "first-merge": done("2026-10-06"),
    "heroes-discovered-3": done(null),
    "first-weekly-quest": done("2026-10-12"),
    "first-peer-review": done("2026-10-20"),
    "reach-knight": done("2026-11-02"),
    "backend-l1": done("2026-10-10"),
    "backend-l4": done("2026-11-10"),
    "frontend-l1": done("2026-10-15"),
    "fullstack-l1": done("2026-10-18"),
    "ai_ml-l1": done("2026-11-01"),
    "first-release": done("2026-10-25"),
  },
  activeQuests: 4,
};

const everything: Record<string, CheckpointFact> = Object.fromEntries(
  [
    "first-commit",
    "first-victory",
    "first-hero",
    "first-merge",
    "heroes-discovered-3",
    "first-weekly-quest",
    "first-peer-review",
    "reach-knight",
    "first-ally",
    "first-release",
    "hero-expert",
    "champion-trial",
    "heroes-unlocked-6",
    "emblem-level-5",
    "reach-paragon",
    "reach-eternal",
    "hero-virtuoso",
    "season-badges-4",
    ...["frontend", "backend", "fullstack", "ai_ml", "devops", "database", "open_source"].flatMap(
      (e) => [`${e}-l1`, `${e}-l4`, `${e}-l7`],
    ),
  ].map((id) => [id, done("2029-06-30")]),
);
// The squad system does not exist: "First verified ally" stays unavailable even for a legend.
everything["first-ally"] = { cleared: false, on: null, unavailable: true };

/** Everything cleared, very large values, Eternal with thousands of stars. */
export const LEGEND: MapFacts = {
  asOf: "2030-01-15",
  level: 1_250,
  exp: 987_654_321,
  rank: { tier: "eternal", division: null, stars: 12_345 },
  emblems: Object.fromEntries(
    ["frontend", "backend", "fullstack", "ai_ml", "devops", "database", "open_source"].map((e) => [
      e,
      { ep: 99_999, level: 10 },
    ]),
  ),
  checkpoints: everything,
  activeQuests: 128,
};

/** Late game, Throne current with one checkpoint left; Ascendant (undivided tier). */
export const THRONE_CURRENT: MapFacts = {
  ...LEGEND,
  asOf: "2029-03-01",
  level: 57,
  exp: 80_000,
  rank: { tier: "ascendant", division: null, stars: 6 },
  checkpoints: { ...everything, "season-badges-4": { cleared: false, on: null } },
  activeQuests: 2,
};

export const LONG_NAME =
  "Sir Bartholomew Maximilian Featherstonehaugh-Cholmondeley the Third of the Very Long Repository";
export const UNICODE_NAME = "李小龍 🐉 Ünïcödé Ñame";
export const HOSTILE_NAME =
  '</text><script>alert(1)</script><a href="javascript:x">&amp;\u202Eevil';
