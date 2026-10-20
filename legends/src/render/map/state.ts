/**
 * Map state (GDD §J.3, map-specification §4–§5), in two pure steps:
 * 1. `mapFacts(output)` reads one engine run: level, EXP, rank, emblem EP and levels, active
 *    quests, and the evidence for every checkpoint (ledger entries and season states).
 * 2. `mapStateFromFacts(facts)` applies the gate, state and progress rules and validates
 *    the result against the schema.
 *
 * Gates and checkpoints are monotonic: level, emblem levels, medals and recorded tiers never
 * go down, so an unlocked region or cleared checkpoint stays that way (GDD §J.3).
 */
import type { EngineOutput } from "../../engine/engine.ts";
import type { EmblemId } from "../../engine/heroes/emblems.ts";
import type { LedgerEntry } from "../../engine/ledger.ts";
import { cumulativeExpForLevel } from "../../engine/level.ts";
import { RULESET_V1, type Ruleset, type TierId } from "../../engine/rules.ts";
import { initials, sanitizeLabel, stripPictographs } from "../text.ts";
import {
  MAIN_REGION_IDS,
  type MainRegionId,
  REGIONS,
  type RegionDef,
  regionDef,
} from "./catalog.ts";
import { type MapState, parseMapState } from "./schema.ts";

export interface CheckpointFact {
  cleared: boolean;
  /** Day of the evidence (null when the source has no date). */
  on: string | null;
  /** The system that proves it does not exist yet. */
  unavailable?: boolean;
}

export interface MapFacts {
  asOf: string;
  level: number;
  exp: number;
  rank: MapState["rank"];
  emblems: Partial<Record<EmblemId, { ep: number; level: number }>>;
  /** Evidence per checkpoint id (missing = not cleared). */
  checkpoints: Readonly<Record<string, CheckpointFact>>;
  activeQuests: number;
}

export interface MapStateOptions {
  /** Player display name (untrusted; sanitised here). */
  name: string;
  sample?: boolean;
  stale?: boolean;
  rules?: Ruleset;
}

const earliest = (entries: readonly LedgerEntry[]): CheckpointFact => {
  const days = entries
    .map((e) => e.effectiveDay ?? "")
    .filter(Boolean)
    .sort();
  return entries.length > 0 ? { cleared: true, on: days[0] ?? null } : { cleared: false, on: null };
};
const minDay = (days: ReadonlyArray<string | undefined>): CheckpointFact => {
  const sorted = days.filter((d): d is string => typeof d === "string" && d.length > 0).sort();
  return sorted.length > 0
    ? { cleared: true, on: sorted[0] ?? null }
    : { cleared: false, on: null };
};

/** Checkpoint evidence from one engine run (achievement ids, ledger rules, season states). */
export function mapFacts(output: EngineOutput): MapFacts {
  const ledger = output.ledger;
  const medal = (id: string, tier = "-") =>
    earliest(ledger.filter((e) => e.id === `medal|${id}|${tier}`));
  const reached = (tier: TierId) => minDay(output.seasons.map((s) => s.reached[tier]));
  const checkpoints: Record<string, CheckpointFact> = {
    "first-commit": medal("M-001"),
    "first-victory": medal("M-002"),
    "first-hero": earliest(ledger.filter((e) => e.rule === "unlock.hero")),
    "first-merge": medal("M-003"),
    "heroes-discovered-3": {
      cleared:
        output.specialization.heroes.filter((h) => h.kind === "hero" && h.state !== "undiscovered")
          .length >= 3,
      on: null,
    },
    "first-weekly-quest": earliest(
      ledger.filter((e) => e.rule === "quest.complete" && e.meta?.pool === "weekly"),
    ),
    "first-peer-review": medal("M-004"),
    "reach-knight": reached("knight"),
    "first-ally": { cleared: false, on: null, unavailable: true },
    "first-release": medal("M-005"),
    "hero-expert": medal("M-042"),
    "champion-trial": minDay(output.seasons.map((s) => s.trialMet.champion)),
    "heroes-unlocked-6": medal("M-040", "II"),
    "emblem-level-5": medal("M-051"),
    "reach-paragon": reached("paragon"),
    "reach-eternal": reached("eternal"),
    "hero-virtuoso": medal("M-043"),
    "season-badges-4": medal("M-035"),
  };
  for (const def of REGIONS)
    if (def.emblem)
      for (const [i, n] of [1, 4, 7].entries())
        checkpoints[def.checkpoints[i]?.id ?? ""] = earliest(
          ledger.filter((e) => e.id === `emblem.level|${def.emblem}|${n}`),
        );

  const emblems: MapFacts["emblems"] = {};
  for (const e of output.specialization.emblems.emblems)
    emblems[e.id] = { ep: e.ep, level: e.level };
  const rank = output.progress.season?.rank ?? null;
  return {
    asOf: output.schedule.today,
    level: output.records.lifetime.level,
    exp: output.records.lifetime.exp,
    rank: rank ? { tier: rank.tier, division: rank.division, stars: rank.starsInDivision } : null,
    emblems,
    checkpoints,
    activeQuests: [
      ...(output.quests.today?.quests ?? []),
      ...(output.quests.week?.quests ?? []),
    ].filter((q) => q.status === "active").length,
  };
}

export function mapStateFromFacts(facts: MapFacts, options: MapStateOptions): MapState {
  const rules = options.rules ?? RULESET_V1;
  const fact = (id: string): CheckpointFact =>
    facts.checkpoints[id] ?? { cleared: false, on: null };
  const allCleared = (def: RegionDef) => def.checkpoints.every((c) => fact(c.id).cleared);
  const gateMet = (def: RegionDef) => facts.level >= def.gateLevel;

  // Current region (spec §5): the highest unlocked main region; once all six are unlocked,
  // the lowest one not completed (the Throne when everything is cleared). A checkpoint whose
  // system does not exist yet (first verified ally) cannot hold the marker back.
  const settled = (def: RegionDef) =>
    def.checkpoints.every((c) => fact(c.id).cleared || fact(c.id).unavailable);
  const mains = MAIN_REGION_IDS.map(regionDef);
  const unlocked = mains.filter(gateMet);
  let current: RegionDef = unlocked.at(-1) ?? (mains[0] as RegionDef);
  if (unlocked.length === mains.length)
    current = mains.find((m) => !settled(m)) ?? (mains.at(-1) as RegionDef);
  const nextGate = mains.find((m) => !gateMet(m)) ?? null;

  // Next milestone: the first open, available checkpoint of the current region; else the next gate.
  const nextIndex = current.checkpoints.findIndex(
    (c) => !fact(c.id).cleared && !fact(c.id).unavailable,
  );
  const next: MapState["next"] =
    nextIndex >= 0
      ? {
          kind: "checkpoint",
          region: current.id as MainRegionId,
          checkpoint: current.checkpoints[nextIndex]?.id ?? "",
        }
      : nextGate
        ? { kind: "gate", region: nextGate.id as MainRegionId, level: nextGate.gateLevel }
        : { kind: "done" };

  const regions: MapState["regions"] = REGIONS.map((def) => {
    let state: MapState["regions"][number]["state"];
    let missing: "level" | "emblem" | null = null;
    if (def.kind === "domain") {
      const emblem = def.emblem ? facts.emblems[def.emblem] : undefined;
      if (!emblem || emblem.ep <= 0) state = "hidden";
      else if (emblem.level < 1) [state, missing] = ["locked", "emblem"];
      else if (!gateMet(def)) [state, missing] = ["locked", "level"];
      else state = allCleared(def) ? "completed" : "unlocked";
    } else if (!gateMet(def)) [state, missing] = ["locked", "level"];
    else if (allCleared(def)) state = "completed";
    else state = def.id === current.id ? "current" : "unlocked";
    return {
      id: def.id,
      state,
      missing,
      checkpoints: def.checkpoints.map((c, i) => {
        const f = fact(c.id);
        const isNext = next.kind === "checkpoint" && def.id === current.id && i === nextIndex;
        return {
          id: c.id,
          status: f.cleared ? "cleared" : isNext ? "next" : f.unavailable ? "unavailable" : "open",
          clearedOn: f.cleared ? f.on : null,
        };
      }),
    };
  });

  // Progress toward the next region's level gate, or toward every available main checkpoint.
  let progress: MapState["progress"];
  if (nextGate) {
    const from = cumulativeExpForLevel(current.gateLevel, rules);
    const target = cumulativeExpForLevel(nextGate.gateLevel, rules) - from;
    const done = Math.min(Math.max(0, facts.exp - from), target);
    progress = {
      kind: "level",
      current: done,
      target,
      percent: target > 0 ? Math.floor((done * 100) / target) : 100,
    };
  } else {
    const all = mains
      .flatMap((m) => m.checkpoints.map((c) => fact(c.id)))
      .filter((c) => !c.unavailable);
    const done = all.filter((c) => c.cleared).length;
    progress = {
      kind: "checkpoints",
      current: done,
      target: all.length,
      percent: Math.floor((done * 100) / Math.max(1, all.length)),
    };
  }

  const name = sanitizeLabel(stripPictographs(options.name), 64) || "Player";
  return parseMapState({
    version: 1,
    sample: options.sample ?? false,
    stale: options.stale ?? false,
    asOf: facts.asOf,
    player: {
      name,
      initials: sanitizeLabel(initials(name), 2),
      level: facts.level,
      exp: facts.exp,
    },
    rank: facts.rank,
    current: current.id,
    next,
    progress,
    quests: { active: facts.activeQuests },
    regions,
  });
}

/** Map state for one engine run. */
export function buildMapState(output: EngineOutput, options: MapStateOptions): MapState {
  return mapStateFromFacts(mapFacts(output), options);
}
