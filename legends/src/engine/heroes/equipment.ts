/**
 * Equipment (GDD §E, progression-tables §6–7).
 *
 * An item is VERIFIED only by repository evidence (marker files in the default-branch tree,
 * plus successful player-triggered push runs for GitHub Actions) in an eligible repo
 * (public, non-fork, ≥ 5 qualifying player commits). Repo topics give TAGGED (weak)
 * evidence; config declarations are SELF-DECLARED and never rewarded. A detected file shows
 * that a tool is configured in a project, not that the player is proficient with it.
 */
import type { AnyEvent } from "../../normalize/event.ts";
import { matchMarkerItems } from "../../normalize/markers.ts";
import type { LedgerIndex } from "../ledger.ts";
import type { Diagnostics, EngineConfig } from "../qualify.ts";
import { addDays, dayOf, parseInstant } from "../time.ts";
import { type Attribution, creditableRepo } from "./attribution.ts";
import { bp } from "./mastery.ts";

export type SlotCategory = "boots" | "armor" | "forge" | "relic" | "tome" | "charm";
export type ItemTierId = "common" | "rare" | "epic" | "legendary";

export interface ItemDef {
  id: string;
  name: string;
  slot: SlotCategory;
  topic: string;
}

export const ITEMS: readonly ItemDef[] = [
  { id: "github-actions", name: "GitHub Actions", slot: "boots", topic: "github-actions" },
  { id: "docker", name: "Docker", slot: "armor", topic: "docker" },
  { id: "compose", name: "Compose", slot: "armor", topic: "docker-compose" },
  { id: "nginx", name: "Nginx", slot: "armor", topic: "nginx" },
  { id: "terraform", name: "Terraform", slot: "armor", topic: "terraform" },
  { id: "kubernetes", name: "Kubernetes", slot: "armor", topic: "kubernetes" },
  { id: "pnpm", name: "pnpm", slot: "forge", topic: "pnpm" },
  { id: "npm", name: "npm", slot: "forge", topic: "npm" },
  { id: "yarn", name: "Yarn", slot: "forge", topic: "yarn" },
  { id: "bun", name: "Bun", slot: "forge", topic: "bun" },
  { id: "composer", name: "Composer", slot: "forge", topic: "composer" },
  { id: "poetry-pip", name: "Poetry / pip", slot: "forge", topic: "python" },
  { id: "vite", name: "Vite", slot: "forge", topic: "vite" },
  { id: "prisma", name: "Prisma", slot: "relic", topic: "prisma" },
  { id: "db-migrations", name: "Database migrations", slot: "relic", topic: "database" },
  { id: "redis", name: "Redis", slot: "relic", topic: "redis" },
  { id: "vitest", name: "Vitest", slot: "tome", topic: "vitest" },
  { id: "jest", name: "Jest", slot: "tome", topic: "jest" },
  { id: "phpunit", name: "PHPUnit", slot: "tome", topic: "phpunit" },
  { id: "pytest", name: "pytest", slot: "tome", topic: "pytest" },
  { id: "eslint", name: "ESLint", slot: "tome", topic: "eslint" },
  { id: "prettier", name: "Prettier", slot: "tome", topic: "prettier" },
  { id: "laravel", name: "Laravel", slot: "charm", topic: "laravel" },
  { id: "expo", name: "Expo", slot: "charm", topic: "expo" },
  { id: "nextjs", name: "Next.js", slot: "charm", topic: "nextjs" },
  { id: "tailwind", name: "Tailwind CSS", slot: "charm", topic: "tailwindcss" },
  { id: "unity", name: "Unity", slot: "charm", topic: "unity" },
  { id: "godot", name: "Godot", slot: "charm", topic: "godot" },
];

export const ITEM_TIERS: ReadonlyArray<{
  id: ItemTierId;
  repos: number;
  bp: number;
  recentDays?: number;
}> = [
  { id: "common", repos: 1, bp: 0 },
  { id: "rare", repos: 3, bp: 20 },
  { id: "epic", repos: 6, bp: 50 },
  { id: "legendary", repos: 10, bp: 100, recentDays: 90 },
];
export const BUILD_SLOTS = 5;
export const ELIGIBLE_REPO_MIN_COMMITS = 5;

export interface ItemState {
  id: string;
  def: ItemDef;
  state: "verified" | "tagged" | "none";
  tier: ItemTierId | null;
  /** Eligible repos with verified evidence. */
  verifiedRepos: number;
  /** Eligible repos where only a topic mentions the tool. */
  taggedRepos: number;
  lastSeen: string | null;
  evidence: Array<"marker" | "workflow_run" | "topic">;
}

export interface BuildSlot {
  index: number;
  itemId: string | null;
  state: "verified" | "tagged" | "empty";
}

export interface EquipmentResult {
  items: ItemState[];
  build: BuildSlot[];
  declaredKit: Array<{ id: string; name: string }>;
  /** True until repository trees are collected: marker evidence is unavailable. */
  markerDataMissing: boolean;
}

export interface EquipmentConfig {
  build?: readonly string[];
  declaredTools?: readonly string[];
}

const ID = /^[a-z0-9.-]{1,48}$/;

export function evaluateEquipment(
  attribution: Attribution,
  events: ReadonlyMap<string, AnyEvent>,
  ledger: LedgerIndex,
  engineConfig: EngineConfig,
  equipmentConfig: EquipmentConfig | undefined,
  rulesVersion: string,
  runAt: string,
  diagnostics: Diagnostics,
): EquipmentResult {
  const timezone = engineConfig.timezone;
  const today = dayOf(parseInstant(runAt) ?? 0, timezone);
  const eligible = [...attribution.repos.values()]
    .filter((f) => f.qualifyingCommits >= ELIGIBLE_REPO_MIN_COMMITS)
    .sort((a, b) => (a.repo.id < b.repo.id ? -1 : 1));

  // Latest successful, player-triggered push run per eligible repo (GitHub Actions evidence).
  const runDay = new Map<string, string>();
  for (const event of events.values()) {
    if (event.type !== "workflow_run" || !creditableRepo(event.repo, engineConfig)) continue;
    const m = event.metadata;
    const ms = parseInstant(m.createdAt);
    if (
      ms === null ||
      m.event !== "push" ||
      m.conclusion !== "success" ||
      m.actorKind !== "user" ||
      !m.triggeredByPlayer
    )
      continue;
    const day = dayOf(ms, timezone);
    if ((runDay.get(event.repo.id) ?? "") < day) runDay.set(event.repo.id, day);
  }

  const verified = new Map<
    string,
    { repos: number; lastSeen: string | null; evidence: Set<"marker" | "workflow_run"> }
  >();
  const tagged = new Map<string, number>();
  for (const facts of eligible) {
    const items = new Set(matchMarkerItems(facts.markerPaths ?? []));
    for (const item of items) {
      let seen = facts.markersObservedOn;
      const evidence = new Set<"marker" | "workflow_run">(["marker"]);
      if (item === "github-actions") {
        const run = runDay.get(facts.repo.id);
        if (!run) continue; // workflow file without a successful player run is not enough
        evidence.add("workflow_run");
        if (!seen || run > seen) seen = run;
      }
      const v = verified.get(item) ?? { repos: 0, lastSeen: null, evidence: new Set() };
      v.repos++;
      if (seen && (!v.lastSeen || seen > v.lastSeen)) v.lastSeen = seen;
      for (const e of evidence) v.evidence.add(e);
      verified.set(item, v);
    }
    const topics = new Set(facts.latestTopics.map((t) => t.toLowerCase()));
    for (const def of ITEMS)
      if (topics.has(def.topic) && !items.has(def.id))
        tagged.set(def.id, (tagged.get(def.id) ?? 0) + 1);
  }

  const items: ItemState[] = [];
  for (const def of ITEMS) {
    const v = verified.get(def.id);
    let derived: ItemTierId | null = null;
    for (const tier of ITEM_TIERS) {
      if (!v || v.repos < tier.repos) break;
      if (tier.recentDays && (!v.lastSeen || v.lastSeen < addDays(today, -tier.recentDays))) break;
      derived = tier.id;
    }
    // Record tiers (milestones, never revoked) and their first-time BP.
    for (const tier of ITEM_TIERS) {
      if (
        !derived ||
        ITEM_TIERS.findIndex((t) => t.id === tier.id) >
          ITEM_TIERS.findIndex((t) => t.id === derived)
      )
        break;
      const id = `equipment.tier|${def.id}|${tier.id}`;
      if (ledger.has(id)) continue;
      ledger.add({
        id,
        kind: "unlock",
        rule: "equipment.tier",
        ruleVersion: rulesVersion,
        subject: [`item:${def.id}`],
        amount: 0,
        effectiveDay: today,
        createdAt: runAt,
        meta: { item: def.id, tier: tier.id },
      });
      if (tier.bp > 0)
        ledger.add(
          bp(
            `bp.equipment|${def.id}|${tier.id}`,
            "bp.equipment_tier",
            `item:${def.id}`,
            tier.bp,
            today,
            runAt,
            rulesVersion,
            { item: def.id, tier: tier.id },
          ),
        );
    }
    let recorded: ItemTierId | null = null;
    for (const tier of ITEM_TIERS)
      if (ledger.has(`equipment.tier|${def.id}|${tier.id}`)) recorded = tier.id;
    const isVerified = recorded !== null;
    const tagCount = tagged.get(def.id) ?? 0;
    items.push({
      id: def.id,
      def,
      state: isVerified ? "verified" : tagCount > 0 ? "tagged" : "none",
      tier: recorded,
      verifiedRepos: v?.repos ?? 0,
      taggedRepos: tagCount,
      lastSeen: v?.lastSeen ?? null,
      evidence: [...(v?.evidence ?? []), ...(tagCount > 0 ? (["topic"] as const) : [])].sort(),
    });
  }

  return {
    items,
    build: buildSlots(items, equipmentConfig?.build ?? [], diagnostics),
    declaredKit: declaredKit(equipmentConfig?.declaredTools ?? [], diagnostics),
    markerDataMissing: eligible.every((f) => f.markerPaths === null),
  };
}

/** Build rules (GDD §E.5): verified items only, one tagged item at most, one Boots, 5 slots. */
function buildSlots(
  items: readonly ItemState[],
  requested: readonly string[],
  diagnostics: Diagnostics,
): BuildSlot[] {
  const chosen: BuildSlot[] = [];
  const used = new Set<string>();
  let boots = false;
  let taggedUsed = false;
  for (const id of requested) {
    const item = items.find((i) => i.id === id);
    if (!item) {
      diagnostics.add("unknown_item", ID.test(id) ? id : "invalid-id");
      continue;
    }
    if (used.has(id)) continue;
    if (item.state === "none") {
      diagnostics.add("item_not_owned", id);
      continue;
    }
    if (item.state === "tagged" && taggedUsed) {
      diagnostics.add("tagged_slot_taken", id);
      continue;
    }
    if (item.def.slot === "boots" && boots) {
      diagnostics.add("second_boots", id);
      continue;
    }
    if (chosen.length >= BUILD_SLOTS) {
      diagnostics.add("build_full", id);
      continue;
    }
    used.add(id);
    if (item.def.slot === "boots") boots = true;
    if (item.state === "tagged") taggedUsed = true;
    chosen.push({
      index: chosen.length,
      itemId: id,
      state: item.state === "tagged" ? "tagged" : "verified",
    });
  }
  while (chosen.length < BUILD_SLOTS)
    chosen.push({ index: chosen.length, itemId: null, state: "empty" });
  return chosen;
}

/** Self-declared tools: shown with ✎, never in the build, never rewarded. */
function declaredKit(
  declared: readonly string[],
  diagnostics: Diagnostics,
): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  for (const id of declared) {
    if (!ID.test(id)) {
      diagnostics.add("invalid_declared_tool", "invalid-id");
      continue;
    }
    if (out.some((d) => d.id === id)) continue;
    out.push({ id, name: ITEMS.find((i) => i.id === id)?.name ?? id });
  }
  return out;
}
