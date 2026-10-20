/**
 * Render-ready view models for hero cards, mastery indicators, emblem progression and
 * equipment panels (design/component-catalog C-30…C-39). Pure data: renderers decide
 * layout and escaping. Every value carries its provenance:
 *   "derived" (Σ) computed from verified events · "self_declared" (✎) chosen in config.
 */
import {
  HERO_UNLOCK,
  MASTERY_CAPTION,
  MASTERY_TIERS,
  nextMasteryTier,
  ROLES,
  type RoleId,
} from "./catalog.ts";
import { EMBLEM_LEVELS, type EmblemResult } from "./emblems.ts";
import type { EquipmentResult, ItemTierId, SlotCategory } from "./equipment.ts";
import type { HeroState } from "./mastery.ts";

export type Provenance = "verified" | "derived" | "self_declared";

export interface IconRef {
  /** Configurable asset path (no proprietary artwork; files are produced by the renderer). */
  asset: string;
  glyph: string;
  monogram: string;
  accent: string;
}

export interface ProgressIndicator {
  /** Integer percent 0–100 toward the next step (100 at the top). */
  percent: number;
  current: number;
  next: number | null;
  label: string;
}

export interface HeroCardView {
  id: string;
  name: string;
  epithet: string | null;
  technology: string;
  role: { id: RoleId | null; name: string; glyph: string };
  state: "discovered" | "unlocked";
  description: string | null;
  icon: IconRef;
  mastery: {
    tier: string | null;
    tierName: string | null;
    mp: number;
    indicator: ProgressIndicator;
    provenance: Provenance;
    approximate: boolean;
  };
  repos: number;
  lastActive: string | null;
  isMain: boolean;
  mainProvenance: Provenance;
  unlockHint: string | null;
  caption: string;
}

export interface PresentationOptions {
  /** Base path for hero and emblem icon assets, e.g. "assets/legends/heroes". */
  iconBasePath?: string;
}

function indicator(
  current: number,
  start: number,
  next: number | null,
  label: string,
): ProgressIndicator {
  if (next === null) return { percent: 100, current, next: null, label };
  const span = Math.max(1, next - start);
  return {
    percent: Math.max(0, Math.min(100, Math.floor(((current - start) * 100) / span))),
    current,
    next,
    label,
  };
}

export function heroCard(state: HeroState, options: PresentationOptions = {}): HeroCardView | null {
  if (state.state === "undiscovered" || state.hidden) return null;
  const base = options.iconBasePath ?? "assets/legends/heroes";
  const role = ROLES.find((r) => r.id === state.hero?.role);
  const tierDef = MASTERY_TIERS.find((t) => t.id === state.tier) ?? null;
  const next = state.state === "unlocked" ? nextMasteryTier(state.mp) : (MASTERY_TIERS[0] ?? null);
  const start = state.state === "unlocked" ? (tierDef?.mp ?? 0) : 0;
  const language = state.languages[0] ?? state.id.replace(/^unknown:/, "");
  return {
    id: state.id,
    name: state.hero?.name ?? `Unknown Spirit (${language})`,
    epithet: state.hero?.epithet ?? null,
    technology: state.hero?.technology ?? language,
    role: { id: role?.id ?? null, name: role?.name ?? "Unaligned", glyph: role?.glyph ?? "circle" },
    state: state.state,
    description: state.hero?.description ?? null,
    icon: {
      asset: `${base}/${state.hero ? state.id : "unknown-spirit"}.svg`,
      glyph: role?.glyph ?? "circle",
      monogram: state.hero?.monogram ?? "??",
      accent: state.hero?.accent ?? "#8792AB",
    },
    mastery: {
      tier: state.tier,
      tierName: tierDef?.name ?? null,
      mp: state.mp,
      indicator: indicator(
        state.mp,
        start,
        next?.mp ?? null,
        next ? `${state.mp} / ${next.mp} MP to ${next.name}` : `${state.mp} MP (max tier)`,
      ),
      provenance: "derived",
      approximate: state.approximate,
    },
    repos: state.repos,
    lastActive: state.lastActive,
    isMain: state.isMain,
    mainProvenance: "self_declared",
    unlockHint:
      state.state === "discovered" && state.hero
        ? `Unlocks at ${HERO_UNLOCK.minWeightedUsage} MP with ≥ ${HERO_UNLOCK.minSharePercent}% share in a repo with ≥ ${HERO_UNLOCK.minRepoCommits} qualifying commits`
        : null,
    caption: MASTERY_CAPTION,
  };
}

/** Top three unlocked, visible heroes by MP, main hero first (C-30). */
export function heroLineup(
  states: readonly HeroState[],
  options: PresentationOptions = {},
): HeroCardView[] {
  const unlocked = states.filter((s) => s.state === "unlocked" && !s.hidden && s.kind === "hero");
  const sorted = [...unlocked].sort(
    (a, b) => Number(b.isMain) - Number(a.isMain) || b.mp - a.mp || (a.id < b.id ? -1 : 1),
  );
  return sorted
    .slice(0, 3)
    .map((s) => heroCard(s, options))
    .filter((c): c is HeroCardView => c !== null);
}

export interface HeroCollectionView {
  roles: Array<{ role: RoleId; name: string; glyph: string; heroes: HeroCardView[] }>;
  unknownSpirits: HeroCardView[];
  totals: { unlocked: number; discovered: number; catalog: number };
  caption: string;
}

/** Full collection grouped by role; undiscovered heroes are not shown (GDD §C.3). */
export function heroCollection(
  states: readonly HeroState[],
  options: PresentationOptions = {},
): HeroCollectionView {
  const cards = states.map((s) => ({ s, card: heroCard(s, options) }));
  const order = (a: HeroCardView, b: HeroCardView) =>
    a.state === b.state
      ? b.mastery.mp - a.mastery.mp || (a.id < b.id ? -1 : 1)
      : a.state === "unlocked"
        ? -1
        : 1;
  return {
    roles: ROLES.map((role) => ({
      role: role.id,
      name: role.name,
      glyph: role.glyph,
      heroes: cards
        .filter((c) => c.card && c.s.hero?.role === role.id)
        .map((c) => c.card as HeroCardView)
        .sort(order),
    })),
    unknownSpirits: cards
      .filter((c) => c.card && c.s.kind === "unknown_spirit")
      .map((c) => c.card as HeroCardView)
      .sort(order),
    totals: {
      unlocked: states.filter((s) => s.kind === "hero" && s.state === "unlocked").length,
      discovered: states.filter((s) => s.kind === "hero" && s.state === "discovered").length,
      catalog: states.filter((s) => s.kind === "hero").length,
    },
    caption: MASTERY_CAPTION,
  };
}

export interface EmblemPanelView {
  active: { id: string; name: string; level: number; provenance: Provenance } | null;
  changeableFrom: string | null;
  emblems: Array<{
    id: string;
    name: string;
    domain: string;
    icon: IconRef;
    ep: number;
    level: number;
    indicator: ProgressIndicator;
    owned: boolean;
    attuned: boolean;
    active: boolean;
    suggested: boolean;
    sources: Record<string, number>;
    provenance: Provenance;
  }>;
  notes: string[];
}

export function emblemPanel(
  result: EmblemResult,
  options: PresentationOptions = {},
): EmblemPanelView {
  const base = options.iconBasePath ?? "assets/legends/emblems";
  const active = result.emblems.find((e) => e.active);
  return {
    active: active
      ? { id: active.id, name: active.def.name, level: active.level, provenance: "self_declared" }
      : null,
    changeableFrom: result.changeableFrom,
    emblems: result.emblems.map((e) => ({
      id: e.id,
      name: e.def.name,
      domain: e.def.domain,
      icon: {
        asset: `${base}/${e.id}.svg`,
        glyph: e.def.glyph,
        monogram: e.def.name.slice(0, 2),
        accent: "#4FD1C5",
      },
      ep: e.ep,
      level: e.level,
      indicator: indicator(
        e.ep,
        EMBLEM_LEVELS[e.level - 1] ?? 0,
        e.nextLevelEp,
        e.nextLevelEp === null
          ? `${e.ep} EP (max level)`
          : `${e.ep} / ${e.nextLevelEp} EP to level ${e.level + 1}`,
      ),
      owned: e.owned,
      attuned: e.attuned,
      active: e.active,
      suggested: e.suggested,
      sources: e.sources,
      provenance: "derived",
    })),
    notes: [
      "Emblems show where verified activity went, not assessed skill.",
      "Database EP relies on SQL bytes until schema-path detection exists.",
    ],
  };
}

export interface EquipmentPanelView {
  build: Array<{
    index: number;
    item: {
      id: string;
      name: string;
      slot: SlotCategory;
      tier: ItemTierId | null;
      tagged: boolean;
    } | null;
    provenance: Provenance;
  }>;
  inventory: Array<{
    id: string;
    name: string;
    slot: SlotCategory;
    state: "verified" | "tagged";
    tier: ItemTierId | null;
    verifiedRepos: number;
    taggedRepos: number;
    lastSeen: string | null;
    evidence: string[];
    provenance: Provenance;
  }>;
  declaredKit: Array<{ id: string; name: string; provenance: Provenance }>;
  notes: string[];
}

export function equipmentPanel(result: EquipmentResult): EquipmentPanelView {
  const byId = new Map(result.items.map((i) => [i.id, i]));
  const notes = ["A detected tool shows it is configured in a project, not proficiency."];
  if (result.markerDataMissing)
    notes.push(
      "Repository file markers have not been collected yet; only workflow and topic evidence is available.",
    );
  return {
    build: result.build.map((slot) => {
      const item = slot.itemId ? byId.get(slot.itemId) : undefined;
      return {
        index: slot.index,
        item: item
          ? {
              id: item.id,
              name: item.def.name,
              slot: item.def.slot,
              tier: item.tier,
              tagged: slot.state === "tagged",
            }
          : null,
        provenance: "self_declared",
      };
    }),
    inventory: result.items
      .filter((i) => i.state !== "none")
      .map((i) => ({
        id: i.id,
        name: i.def.name,
        slot: i.def.slot,
        state: i.state as "verified" | "tagged",
        tier: i.tier,
        verifiedRepos: i.verifiedRepos,
        taggedRepos: i.taggedRepos,
        lastSeen: i.lastSeen,
        evidence: i.evidence,
        provenance: (i.state === "verified" ? "verified" : "self_declared") as Provenance,
      })),
    declaredKit: result.declaredKit.map((d) => ({
      ...d,
      provenance: "self_declared" as Provenance,
    })),
    notes,
  };
}
