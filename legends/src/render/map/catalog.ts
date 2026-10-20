/**
 * "The Realms" (map-specification.md §2, GDD §J.2, progression-tables §8). Region names,
 * labels, slots and checkpoints are constants of this module: map state refers to them by
 * id only, so no repository or player text can reach a region plaque.
 */
import type { EmblemId } from "../../engine/heroes/emblems.ts";

export const MAIN_REGION_IDS = [
  "village",
  "forest",
  "river",
  "citadel",
  "peaks",
  "throne",
] as const;
export const DOMAIN_REGION_IDS = [
  "spires",
  "forge",
  "bridges",
  "observatory",
  "harbor",
  "vault",
  "commons",
] as const;
export const REGION_IDS = [...MAIN_REGION_IDS, ...DOMAIN_REGION_IDS] as const;
export type MainRegionId = (typeof MAIN_REGION_IDS)[number];
export type DomainRegionId = (typeof DOMAIN_REGION_IDS)[number];
export type RegionId = (typeof REGION_IDS)[number];

export const MOTIFS = [
  "hut",
  "tree",
  "wave-eye",
  "tower",
  "peaks",
  "throne",
  "spire",
  "anvil",
  "arches",
  "telescope",
  "anchor",
  "vault",
  "gate",
] as const;
export type MotifId = (typeof MOTIFS)[number];

/** Checkpoint node shapes: rank checkpoints are shields, quest checkpoints are diamonds. */
export type CheckpointKind = "standard" | "rank" | "quest";

export interface CheckpointDef {
  id: string;
  label: string;
  kind: CheckpointKind;
}

export interface RegionDef {
  id: RegionId;
  kind: "main" | "domain";
  name: string;
  /** Map label when the full name does not fit (spec §2.1, §7). */
  short: string;
  motif: MotifId;
  /** Plaque centre (fixed slot). */
  x: number;
  y: number;
  /** Main path: level gate. Domain: emblem and level gate. */
  gateLevel: number;
  emblem?: EmblemId;
  /** Domain: the main region its connector joins. */
  anchor?: MainRegionId;
  /** Where the "Next" chip goes for the current region, chosen so it never overlaps a plaque. */
  chip?: "above" | "below";
  checkpoints: readonly [CheckpointDef, CheckpointDef, CheckpointDef];
}

export const CANVAS = {
  width: 420,
  height: 820,
  margin: 16,
  titleBand: 56,
  legendTop: 750,
} as const;
export const MAIN_PLAQUE = { width: 170, height: 56, radius: 12 } as const;
export const DOMAIN_PLAQUE = { width: 128, height: 48, radius: 10 } as const;
export const DOMAIN_GATE_LEVEL = 10;

const emblemCheckpoints = (emblem: EmblemId, label: string): RegionDef["checkpoints"] => [
  { id: `${emblem}-l1`, label: `${label} L1`, kind: "standard" },
  { id: `${emblem}-l4`, label: `${label} L4`, kind: "standard" },
  { id: `${emblem}-l7`, label: `${label} L7`, kind: "standard" },
];

export const REGIONS: readonly RegionDef[] = [
  {
    id: "village",
    kind: "main",
    name: "Starter Village",
    short: "Village",
    motif: "hut",
    x: 240,
    y: 688,
    gateLevel: 1,
    chip: "below",
    checkpoints: [
      { id: "first-commit", label: "First Commit", kind: "standard" },
      { id: "first-victory", label: "First Victory", kind: "standard" },
      { id: "first-hero", label: "First Hero unlocked", kind: "standard" },
    ],
  },
  {
    id: "forest",
    kind: "main",
    name: "Forest of Branches",
    short: "Forest",
    motif: "tree",
    x: 140,
    y: 572,
    gateLevel: 5,
    chip: "above",
    checkpoints: [
      { id: "first-merge", label: "First merged PR", kind: "standard" },
      { id: "heroes-discovered-3", label: "3 heroes discovered", kind: "standard" },
      { id: "first-weekly-quest", label: "First weekly quest", kind: "quest" },
    ],
  },
  {
    id: "river",
    kind: "main",
    name: "River of Reviews",
    short: "River",
    motif: "wave-eye",
    x: 270,
    y: 456,
    gateLevel: 10,
    chip: "below",
    checkpoints: [
      { id: "first-peer-review", label: "First peer review", kind: "standard" },
      { id: "reach-knight", label: "Reach Knight", kind: "rank" },
      { id: "first-ally", label: "First verified ally", kind: "standard" },
    ],
  },
  {
    id: "citadel",
    kind: "main",
    name: "Citadel of Releases",
    short: "Citadel",
    motif: "tower",
    x: 140,
    y: 340,
    gateLevel: 20,
    chip: "below",
    checkpoints: [
      { id: "first-release", label: "First qualifying release", kind: "standard" },
      { id: "hero-expert", label: "Hero at Expert", kind: "standard" },
      { id: "champion-trial", label: "Champion trial completed", kind: "rank" },
    ],
  },
  {
    id: "peaks",
    kind: "main",
    name: "Peaks of Mastery",
    short: "Peaks",
    motif: "peaks",
    x: 280,
    y: 226,
    gateLevel: 35,
    chip: "below",
    checkpoints: [
      { id: "heroes-unlocked-6", label: "6 heroes unlocked", kind: "standard" },
      { id: "emblem-level-5", label: "Emblem level 5", kind: "standard" },
      { id: "reach-paragon", label: "Reach Paragon", kind: "rank" },
    ],
  },
  {
    id: "throne",
    kind: "main",
    name: "Throne of Eternity",
    short: "Throne",
    motif: "throne",
    x: 180,
    y: 112,
    gateLevel: 50,
    chip: "above",
    checkpoints: [
      { id: "reach-eternal", label: "Reach Eternal", kind: "rank" },
      { id: "hero-virtuoso", label: "Hero at Virtuoso", kind: "standard" },
      { id: "season-badges-4", label: "4 season badges", kind: "standard" },
    ],
  },
  {
    id: "spires",
    kind: "domain",
    name: "Lantern Spires",
    short: "Spires",
    motif: "spire",
    x: 70,
    y: 650,
    gateLevel: DOMAIN_GATE_LEVEL,
    emblem: "frontend",
    anchor: "forest",
    checkpoints: emblemCheckpoints("frontend", "Frontend"),
  },
  {
    id: "forge",
    kind: "domain",
    name: "Iron Forge",
    short: "Forge",
    motif: "anvil",
    x: 350,
    y: 600,
    gateLevel: DOMAIN_GATE_LEVEL,
    emblem: "backend",
    anchor: "forest",
    checkpoints: emblemCheckpoints("backend", "Backend"),
  },
  {
    id: "bridges",
    kind: "domain",
    name: "Twin Bridges",
    short: "Bridges",
    motif: "arches",
    x: 70,
    y: 436,
    gateLevel: DOMAIN_GATE_LEVEL,
    emblem: "fullstack",
    anchor: "river",
    checkpoints: emblemCheckpoints("fullstack", "Full-stack"),
  },
  {
    id: "observatory",
    kind: "domain",
    name: "Observatory of Patterns",
    short: "Observatory",
    motif: "telescope",
    x: 350,
    y: 350,
    gateLevel: DOMAIN_GATE_LEVEL,
    emblem: "ai_ml",
    anchor: "citadel",
    checkpoints: emblemCheckpoints("ai_ml", "AI/ML"),
  },
  {
    id: "harbor",
    kind: "domain",
    name: "Harbor of Pipelines",
    short: "Harbor",
    motif: "anchor",
    x: 76,
    y: 250,
    gateLevel: DOMAIN_GATE_LEVEL,
    emblem: "devops",
    anchor: "peaks",
    checkpoints: emblemCheckpoints("devops", "DevOps"),
  },
  {
    id: "vault",
    kind: "domain",
    name: "Vault of Records",
    short: "Vault",
    motif: "vault",
    x: 70,
    y: 184,
    gateLevel: DOMAIN_GATE_LEVEL,
    emblem: "database",
    anchor: "throne",
    checkpoints: emblemCheckpoints("database", "Database"),
  },
  {
    id: "commons",
    kind: "domain",
    name: "Open Commons",
    short: "Commons",
    motif: "gate",
    x: 346,
    y: 156,
    gateLevel: DOMAIN_GATE_LEVEL,
    emblem: "open_source",
    anchor: "throne",
    checkpoints: emblemCheckpoints("open_source", "Open Source"),
  },
];

export function regionDef(id: RegionId): RegionDef {
  const def = REGIONS.find((r) => r.id === id);
  if (!def) throw new Error(`unknown region ${id}`);
  return def;
}

export function plaqueBox(def: RegionDef): { x: number; y: number; width: number; height: number } {
  const size = def.kind === "main" ? MAIN_PLAQUE : DOMAIN_PLAQUE;
  return {
    x: def.x - size.width / 2,
    y: def.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/** Emblem names as shown in lock lines ("Frontend L1"). */
export const EMBLEM_LABELS: Readonly<Record<EmblemId, string>> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Full-stack",
  ai_ml: "AI/ML",
  devops: "DevOps",
  database: "Database",
  open_source: "Open Source",
};
