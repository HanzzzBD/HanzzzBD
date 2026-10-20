/**
 * Text alternatives (map-specification §6, §8). Every fact drawn on the map is also written
 * here: the SVG <desc>, the <img alt> (≤ 600 characters), and the Markdown region list that
 * always follows the image, for screen readers, image-blocked clients and small screens.
 */
import { escapeAttr } from "../svg.ts";
import { formatCount } from "../text.ts";
import { EMBLEM_LABELS, REGIONS, type RegionDef, regionDef } from "./catalog.ts";
import { rankText } from "./rank.ts";
import type { MapState, RegionStateValue } from "./schema.ts";

const cleared = (r: RegionStateValue) => r.checkpoints.filter((c) => c.status === "cleared").length;
const stateOf = (state: MapState, def: RegionDef) =>
  state.regions.find((r) => r.id === def.id) as RegionStateValue;

export function gateText(def: RegionDef, region: RegionStateValue): string {
  if (def.kind === "main" || region.missing === "level") return `Lv ${def.gateLevel}`;
  return `${EMBLEM_LABELS[def.emblem ?? "frontend"]} L1`;
}

export function checkpointLabel(regionId: RegionDef["id"], checkpointId: string): string {
  return regionDef(regionId).checkpoints.find((c) => c.id === checkpointId)?.label ?? checkpointId;
}

/** "First verified ally" / "Reach level 20 to unlock Citadel of Releases" / "All regions cleared". */
export function nextText(state: MapState, compact = false): string {
  const next = state.next;
  if (next.kind === "checkpoint") return checkpointLabel(next.region, next.checkpoint);
  if (next.kind === "gate")
    return compact
      ? `${regionDef(next.region).name} at Lv ${next.level}`
      : `reach level ${next.level} to unlock ${regionDef(next.region).name}`;
  return "All regions cleared";
}

function regionSentence(def: RegionDef, r: RegionStateValue): string {
  const n = cleared(r);
  switch (r.state) {
    case "locked":
      return `${def.name} locked until ${def.kind === "main" || r.missing === "level" ? `level ${def.gateLevel}` : `${EMBLEM_LABELS[def.emblem ?? "frontend"]} emblem level 1`}`;
    case "completed":
      return `${def.name} completed, 3 of 3`;
    case "current":
      return `${def.name}: current region, ${n} of 3`;
    default:
      return `${def.name} ${n} of 3`;
  }
}

/** The SVG <title>. */
export function mapTitle(state: MapState): string {
  return `World map: The Realms${state.sample ? " (sample data)" : ""}`;
}

/** The SVG <desc>: player, rank, current region, next milestone and every visible region. */
export function mapDescription(state: MapState): string {
  const main = REGIONS.filter((d) => d.kind === "main").map((d) =>
    regionSentence(d, stateOf(state, d)),
  );
  const domains = REGIONS.filter(
    (d) => d.kind === "domain" && stateOf(state, d).state !== "hidden",
  ).map((d) => regionSentence(d, stateOf(state, d)));
  const rank = rankText(state.rank).label;
  const progress =
    state.progress.kind === "level"
      ? `${state.progress.percent}% of the way to the next region's level gate`
      : `${state.progress.current} of ${state.progress.target} main-path checkpoints cleared`;
  return [
    ...(state.sample ? ["Sample data."] : []),
    ...(state.stale ? ["Data is out of date."] : []),
    `${state.player.name}, level ${formatCount(state.player.level)}, rank ${rank}.`,
    `You are at ${regionDef(state.current).name}. Next: ${nextText(state)}.`,
    `${progress[0]?.toUpperCase()}${progress.slice(1)}.`,
    `Main path, bottom to top: ${main.join("; ")}.`,
    domains.length > 0
      ? `Domain regions: ${domains.join("; ")}.`
      : "No domain regions discovered yet.",
  ].join(" ");
}

/** <img alt>: the description, cut at a word boundary to ≤ 600 characters. */
export function mapAltText(state: MapState): string {
  const suffix = " Full region list below.";
  const body = mapDescription(state);
  const limit = 600 - suffix.length;
  if (body.length <= limit) return body + suffix;
  const cut = body.slice(0, limit - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…${suffix}`;
}

/** Markdown escaping for inline text and table cells. */
export function escapeMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]{}()#+!|~])/g, "\\$1")
    .replace(/\r?\n/g, " ");
}

/** The region text list (C-51). Hidden domain regions are omitted, as on the map. */
export function regionList(state: MapState): string {
  const current = stateOf(state, regionDef(state.current));
  const upcoming = REGIONS.filter((d) => d.kind === "main" && stateOf(state, d).state === "locked")
    .slice(0, 2)
    .map((d) => `${d.name} at Lv ${d.gateLevel}`);
  const rows = REGIONS.filter((d) => stateOf(state, d).state !== "hidden").map((d) => {
    const r = stateOf(state, d);
    const status =
      r.state === "completed"
        ? "✅ Completed"
        : r.state === "current"
          ? "📍 Current"
          : r.state === "locked"
            ? `🔒 ${gateText(d, r)}`
            : "Unlocked";
    const name =
      d.kind === "domain" ? `${d.name} · ${EMBLEM_LABELS[d.emblem ?? "frontend"]}` : d.name;
    const notes = r.checkpoints
      .filter((c) => c.status === "unavailable")
      .map((c) => `${checkpointLabel(d.id, c.id)} not available yet`);
    return `| ${escapeMarkdown(name)} | ${status} | ${cleared(r)}/3${notes.length ? ` (${escapeMarkdown(notes.join("; "))})` : ""} |`;
  });
  return [
    ...(state.sample ? ["*Sample data.*", ""] : []),
    ...(state.stale ? ["*Data is out of date: this is the last successful map.*", ""] : []),
    `**You are here: ${escapeMarkdown(regionDef(state.current).name)}** (${cleared(current)}/3) — next: *${escapeMarkdown(nextText(state))}*`,
    "",
    upcoming.length > 0
      ? `**Upcoming:** ${escapeMarkdown(upcoming.join(" · "))}`
      : "**Upcoming:** every region is unlocked",
    "",
    "| Region | Status | Progress |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

const ASSET_PATH = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*\.svg$/;

export class AssetPathError extends Error {}

/** Asset references must be relative repo paths to .svg files: no scheme, no "..", no query. */
export function validateAssetPath(path: string): string {
  if (!ASSET_PATH.test(path) || path.includes("..")) throw new AssetPathError("invalid asset path");
  return path;
}

/** README block (readme-layout §3): collapsed map with dark/light variants, then the list. */
export function mapEmbed(state: MapState, assets: { dark: string; light: string }): string {
  const dark = validateAssetPath(assets.dark);
  const light = validateAssetPath(assets.light);
  const current = stateOf(state, regionDef(state.current));
  return [
    "<details>",
    `<summary><b>🗺 World map</b>: ${escapeMarkdown(regionDef(state.current).name)} (${cleared(current)}/3)</summary>`,
    "",
    `<p align="center"><picture><source media="(prefers-color-scheme: light)" srcset="${escapeAttr(light)}"><img src="${escapeAttr(dark)}" width="420" alt="${escapeAttr(mapAltText(state))}"></picture></p>`,
    "",
    regionList(state),
    "",
    "</details>",
  ].join("\n");
}
