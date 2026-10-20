/**
 * Checkpoint renderer (map-specification §3–§4, GDD §J.4). State is carried by shape, fill
 * and stroke style, never by colour alone (WCAG 1.4.1):
 * - cleared: filled node with a check;
 * - next (the next milestone): hollow, thick accent ring;
 * - open: hollow, thin locked-grey ring;
 * - unavailable (system not built yet): hollow, dotted ring.
 * Shapes: standard = circle, rank = shield, quest = diamond.
 */
import { el, pathData, type SvgElement } from "../svg.ts";
import type { Theme } from "../tokens.ts";
import type { CheckpointKind } from "./catalog.ts";
import { glyph } from "./glyphs.ts";
import type { CheckpointStateValue } from "./schema.ts";

export const CHECKPOINT_SPACING = 18;

function outline(
  kind: CheckpointKind,
  cx: number,
  cy: number,
  r: number,
  attrs: Record<string, string | number>,
): SvgElement {
  if (kind === "rank") {
    const w = r * 1.1;
    const top = cy - r * 1.15;
    const bottom = cy + r * 1.25;
    return el("path", {
      d: pathData([
        "M",
        cx - w,
        top,
        "H",
        cx + w,
        "V",
        cy,
        "Q",
        cx + w,
        cy + r * 0.85,
        cx,
        bottom,
        "Q",
        cx - w,
        cy + r * 0.85,
        cx - w,
        cy,
        "Z",
      ]),
      ...attrs,
    });
  }
  if (kind === "quest") {
    const d = r * 1.3;
    return el("polygon", {
      points: [`${cx},${cy - d}`, `${cx + d},${cy}`, `${cx},${cy + d}`, `${cx - d},${cy}`]
        .map(fix)
        .join(" "),
      ...attrs,
    });
  }
  return el("circle", { cx, cy, r, ...attrs });
}
const fix = (pair: string) =>
  pair
    .split(",")
    .map((n) => String(Math.round(Number(n) * 100) / 100))
    .join(",");

export function checkpointNode(
  kind: CheckpointKind,
  status: CheckpointStateValue["status"],
  cx: number,
  cy: number,
  accent: string,
  theme: Theme,
): SvgElement {
  switch (status) {
    case "cleared":
      return el("g", {}, [
        outline(kind, cx, cy, 5.5, { fill: accent }),
        glyph("check", cx, cy, 9, theme.onGold, { strokeWidth: 3.2 }),
      ]);
    case "next":
      return outline(kind, cx, cy, 4.8, {
        fill: theme.bgRaised,
        stroke: theme.gold,
        "stroke-width": 2.2,
      });
    case "unavailable":
      return outline(kind, cx, cy, 4.5, {
        fill: "none",
        stroke: theme.locked,
        "stroke-width": 1.5,
        "stroke-dasharray": "1.5 2",
      });
    default:
      return outline(kind, cx, cy, 4.5, {
        fill: "none",
        stroke: theme.locked,
        "stroke-width": 1.5,
      });
  }
}

/** Three nodes centred on (cx, cy). */
export function checkpointRow(
  kinds: readonly CheckpointKind[],
  checkpoints: readonly CheckpointStateValue[],
  cx: number,
  cy: number,
  accent: string,
  theme: Theme,
): SvgElement {
  return el(
    "g",
    {},
    checkpoints.map((c, i) =>
      checkpointNode(
        kinds[i] ?? "standard",
        c.status,
        cx + (i - 1) * CHECKPOINT_SPACING,
        cy,
        accent,
        theme,
      ),
    ),
  );
}
