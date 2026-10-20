/**
 * Map data schema. The renderer accepts only a `MapState` that passed `parseMapState`:
 * regions and checkpoints are catalog ids, counts are bounded integers, dates are days, and
 * the only free text (the player's display name) must already be sanitised.
 */
import { z } from "zod";
import { sanitizeLabel } from "../text.ts";
import { DOMAIN_REGION_IDS, MAIN_REGION_IDS, REGION_IDS, regionDef } from "./catalog.ts";

const TIER_IDS = [
  "initiate",
  "squire",
  "knight",
  "warden",
  "champion",
  "paragon",
  "ascendant",
  "eternal",
] as const;
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Count = z.number().int().min(0).max(1e12);

const CheckpointState = z.strictObject({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  /** next = the next milestone (first open checkpoint of the current region). */
  status: z.enum(["cleared", "next", "open", "unavailable"]),
  clearedOn: Day.nullable(),
});

const RegionState = z.strictObject({
  id: z.enum(REGION_IDS),
  state: z.enum(["hidden", "locked", "unlocked", "current", "completed"]),
  /** For locked regions: which part of the gate is missing. */
  missing: z.enum(["level", "emblem"]).nullable(),
  checkpoints: z.array(CheckpointState).length(3),
});

const Next = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("checkpoint"),
    region: z.enum(MAIN_REGION_IDS),
    checkpoint: z.string(),
  }),
  z.strictObject({
    kind: z.literal("gate"),
    region: z.enum(MAIN_REGION_IDS),
    level: z.number().int().min(1),
  }),
  z.strictObject({ kind: z.literal("done") }),
]);

export const MapStateSchema = z
  .strictObject({
    version: z.literal(1),
    /** Watermark "SAMPLE DATA" (fixtures, previews). */
    sample: z.boolean(),
    /** Last successful data is older than the freshness window (spec §11). */
    stale: z.boolean(),
    asOf: Day,
    player: z.strictObject({
      name: z.string().min(1).max(256),
      initials: z.string().min(1).max(8),
      level: z.number().int().min(1).max(1_000_000),
      exp: Count,
    }),
    rank: z
      .strictObject({
        tier: z.enum(TIER_IDS),
        division: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
        stars: Count,
      })
      .nullable(),
    current: z.enum(MAIN_REGION_IDS),
    next: Next,
    /** Progress toward the next region gate (level), or toward clearing every checkpoint. */
    progress: z.strictObject({
      kind: z.enum(["level", "checkpoints"]),
      current: Count,
      target: Count,
      percent: z.number().int().min(0).max(100),
    }),
    quests: z.strictObject({ active: Count }),
    regions: z.array(RegionState).length(REGION_IDS.length),
  })
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (s.player.name !== sanitizeLabel(s.player.name, 64)) issue("player.name must be sanitised");
    if (s.player.initials !== sanitizeLabel(s.player.initials, 2))
      issue("player.initials must be sanitised");
    const ids = s.regions.map((r) => r.id);
    if (new Set(ids).size !== ids.length) issue("duplicate region");
    for (const r of s.regions) {
      const def = regionDef(r.id);
      def.checkpoints.forEach((c, i) => {
        if (r.checkpoints[i]?.id !== c.id) issue(`${r.id}: checkpoint ${i} must be ${c.id}`);
      });
      // A cleared checkpoint may have an unknown date; an uncleared one never has a date.
      for (const c of r.checkpoints)
        if (c.status !== "cleared" && c.clearedOn !== null)
          issue(`${r.id}/${c.id}: clearedOn without clearing`);
      if (r.state === "hidden" && def.kind !== "domain")
        issue(`${r.id}: only domain regions can be hidden`);
      if (r.state === "current" && def.kind !== "main")
        issue(`${r.id}: only main regions can be current`);
      if ((r.state === "locked") !== (r.missing !== null))
        issue(`${r.id}: missing gate only for locked regions`);
      if (r.state === "completed" && r.checkpoints.some((c) => c.status !== "cleared"))
        issue(`${r.id}: completed needs 3 cleared`);
      if (r.checkpoints.some((c) => c.status === "next") && r.id !== s.current)
        issue(`${r.id}: next checkpoint outside current region`);
    }
    const current = s.regions.find((r) => r.id === s.current);
    if (!current || (current.state !== "current" && current.state !== "completed"))
      issue("current region must be unlocked");
    if (s.regions.filter((r) => r.state === "current").length > 1)
      issue("more than one current region");
    for (const id of DOMAIN_REGION_IDS) if (!ids.includes(id)) issue(`missing ${id}`);
    if (s.progress.current > s.progress.target && s.progress.target > 0)
      issue("progress beyond target");
  });

export type MapState = z.infer<typeof MapStateSchema>;
export type RegionStateValue = MapState["regions"][number];
export type CheckpointStateValue = RegionStateValue["checkpoints"][number];

export class MapStateError extends Error {}

/** Validates structured state before rendering. Throws `MapStateError` with safe messages. */
export function parseMapState(input: unknown): MapState {
  const result = MapStateSchema.safeParse(input);
  if (!result.success)
    throw new MapStateError(
      `invalid map state: ${result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  return result.data;
}
