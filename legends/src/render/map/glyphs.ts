/**
 * Code-drawn glyphs on the 24-unit icon grid (visual-direction §5): 2-unit strokes, round
 * caps and joins. Every path is original to this project (originality checklist §2.1);
 * none is traced from game art. Glyph ids are a closed set, so state cannot name an asset
 * that does not exist.
 */
import { el, type SvgElement } from "../svg.ts";
import type { MotifId } from "./catalog.ts";

/** Stroke paths per motif, in 24-unit coordinates. Filled dots are listed separately. */
const MOTIF_PATHS: Readonly<
  Record<MotifId, { d: string; dots?: ReadonlyArray<[number, number, number]> }>
> = {
  hut: { d: "M3 12 L12 4 L21 12 M6 10.5 V20 H18 V10.5 M10.5 20 V15 H13.5 V20" },
  tree: {
    d: "M12 21 V12 M12 15 L7 10 M12 12 L17 7 M12 12 L12 6",
    dots: [
      [7, 9, 2],
      [17, 6, 2],
      [12, 5, 2],
    ],
  },
  "wave-eye": {
    d: "M3 18 Q6 15 9 18 T15 18 T21 18 M4 9.5 Q12 3 20 9.5 Q12 16 4 9.5 Z",
    dots: [[12, 9.5, 2]],
  },
  tower: {
    d: "M8 21 V10 H16 V21 M8 10 V7 H10 V9 H12 V7 H14 V9 H16 V7 M12 7 V2.5 L16.5 4 L12 5.5 M11 21 V17 H13 V21",
  },
  peaks: { d: "M2 20 L9 7 L13.5 14 L16 10 L22 20 Z M7 10.5 L9 12 L11 10.5" },
  throne: {
    d: "M7 21 V11 H17 V21 M7 16 H17 M9 11 V6.5 H15 V11 M12 1.5 V3.5 M8 2.8 L9.2 4.6 M16 2.8 L14.8 4.6",
  },
  spire: { d: "M12 2 L15.5 9 H8.5 Z M9.5 9 V21 H14.5 V9 M8 21 H16", dots: [[12, 14, 1.8]] },
  anvil: { d: "M3 8 H18 Q21 8 21 10 Q16 10 15 13 V16 H18 V20 H6 V16 H9 V13 Q5 12 3 8 Z" },
  arches: { d: "M2 18 Q7 7 12 18 Q17 7 22 18 M2 18 H22 M2 21 H22" },
  telescope: { d: "M3 13 L17 6 L19.5 10.5 L5.5 17.5 Z M11 15 L8 21 M12.5 14.5 L16 21" },
  anchor: { d: "M12 6 V21 M8 10 H16 M4.5 15 Q5.5 21 12 21 Q18.5 21 19.5 15", dots: [[12, 4, 2]] },
  vault: { d: "M4 4 H20 V20 H4 Z M12 8 V16 M8 12 H16 M9.2 9.2 L14.8 14.8 M14.8 9.2 L9.2 14.8" },
  gate: { d: "M4 21 V9 Q12 2 20 9 V21 M4 21 L9.5 18.5 V10.5 L4 9 M20 21 L14.5 18.5 V10.5 L20 9" },
};

const UI_PATHS = {
  lock: "M8 11 V8 A4 4 0 0 1 16 8 V11",
  check: "M7 12.5 L10.5 16 L17 9",
  pennant: "M5 2 V22 M5 3 H19 L15 7.5 L19 12 H5",
  scroll:
    "M6 5 H17 Q19 5 19 7 V19 Q19 21 17 21 H7 Q5 21 5 19 V7 M6 5 Q4 5 4 7 Q4 9 6 9 H8 M9 11 H15 M9 15 H15",
  star: "M12 2.5 L14.6 8.9 L21.5 9.4 L16.2 13.8 L17.9 20.6 L12 16.9 L6.1 20.6 L7.8 13.8 L2.5 9.4 L9.4 8.9 Z",
  shield: "M4 3 H20 V11 Q20 18 12 22 Q4 18 4 11 Z",
  pin: "M12 23 Q4 14.5 4 9.5 A8 8 0 0 1 20 9.5 Q20 14.5 12 23 Z",
} as const;
export type UiGlyph = keyof typeof UI_PATHS;

const placement = (cx: number, cy: number, size: number) =>
  `translate(${round(cx)} ${round(cy)}) scale(${round(size / 24)}) translate(-12 -12)`;
const round = (n: number) => Math.round(n * 100) / 100;

/** A region motif centred at (cx, cy), `size` px wide, stroked in `colour`. */
export function motif(
  id: MotifId,
  cx: number,
  cy: number,
  size: number,
  colour: string,
): SvgElement {
  const def = MOTIF_PATHS[id];
  return el("g", { transform: placement(cx, cy, size), "aria-hidden": "true" }, [
    el("path", {
      d: def.d,
      fill: "none",
      stroke: colour,
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    ...(def.dots ?? []).map(([x, y, r]) => el("circle", { cx: x, cy: y, r, fill: colour })),
  ]);
}

/** A UI glyph. `fill` glyphs (pin, shield, star) are filled; the others are stroked. */
export function glyph(
  id: UiGlyph,
  cx: number,
  cy: number,
  size: number,
  colour: string,
  options: { fill?: string; strokeWidth?: number } = {},
): SvgElement {
  const children: SvgElement[] = [];
  if (id === "lock") {
    children.push(el("rect", { x: 6, y: 11, width: 12, height: 9.5, rx: 1.8, fill: colour }));
    children.push(
      el("path", {
        d: UI_PATHS.lock,
        fill: "none",
        stroke: colour,
        "stroke-width": options.strokeWidth ?? 2.2,
        "stroke-linecap": "round",
      }),
    );
  } else {
    children.push(
      el("path", {
        d: UI_PATHS[id],
        fill: options.fill ?? "none",
        stroke: colour,
        "stroke-width": options.strokeWidth ?? 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
  }
  return el("g", { transform: placement(cx, cy, size), "aria-hidden": "true" }, children);
}

export const MOTIF_IDS = Object.keys(MOTIF_PATHS) as MotifId[];
export const UI_GLYPH_IDS = Object.keys(UI_PATHS) as UiGlyph[];
