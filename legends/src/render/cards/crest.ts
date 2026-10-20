/**
 * Rank crest (component C-21, visual-direction §6): a heater shield in the tier colour, a
 * tier ornament from general heraldry, and the division numeral (star count for Eternal).
 * Drawn on a 96 × 120 grid and scaled. Original construction; no game badge is traced.
 */
import type { TierId } from "../../engine/rules.ts";
import { el, type SvgElement, text } from "../svg.ts";
import type { Theme } from "../tokens.ts";

const SHIELD = "M8 10 H88 V58 Q88 98 48 116 Q8 98 8 58 Z";
const ROMAN = { 1: "I", 2: "II", 3: "III" } as const;

function star(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(
      `${Math.round((cx + r * Math.cos(a)) * 100) / 100},${Math.round((cy + r * Math.sin(a)) * 100) / 100}`,
    );
  }
  return pts.join(" ");
}

function ornament(
  tier: TierId,
  theme: Theme,
  colour: string,
): { behind: SvgElement[]; front: SvgElement[] } {
  const stroke = {
    fill: "none",
    stroke: colour,
    "stroke-width": 4,
    "stroke-linecap": "round" as const,
  };
  const wings = [
    el("polygon", { points: "8,26 -10,14 -6,38 -14,44 8,52", fill: colour, opacity: 0.85 }),
    el("polygon", { points: "88,26 106,14 102,38 110,44 88,52", fill: colour, opacity: 0.85 }),
  ];
  switch (tier) {
    case "squire":
      return {
        behind: [],
        front: [
          el("rect", { x: 8, y: 38, width: 80, height: 9, fill: theme.bgAbyss, opacity: 0.35 }),
        ],
      };
    case "knight":
      return {
        behind: [
          el("line", {
            x1: -2,
            y1: 4,
            x2: 98,
            y2: 112,
            stroke: theme.textSecondary,
            "stroke-width": 5,
            "stroke-linecap": "round",
          }),
          el("line", {
            x1: 98,
            y1: 4,
            x2: -2,
            y2: 112,
            stroke: theme.textSecondary,
            "stroke-width": 5,
            "stroke-linecap": "round",
          }),
        ],
        front: [],
      };
    case "warden":
      return {
        behind: [],
        front: [
          el("path", { d: "M22 112 Q2 92 6 64", ...stroke, stroke: theme.tiers.warden }),
          el("path", { d: "M74 112 Q94 92 90 64", ...stroke, stroke: theme.tiers.warden }),
        ],
      };
    case "champion":
      return { behind: wings, front: [] };
    case "paragon":
      return {
        behind: [],
        front: [
          el("polygon", {
            points: "26,12 30,-6 40,4 48,-10 56,4 66,-6 70,12",
            fill: theme.gold,
            stroke: theme.goldHi,
            "stroke-width": 1.5,
          }),
        ],
      };
    case "ascendant":
      return {
        behind: [
          el("circle", {
            cx: 48,
            cy: 8,
            r: 24,
            fill: "none",
            stroke: theme.goldHi,
            "stroke-width": 3,
          }),
          ...wings,
        ],
        front: [],
      };
    case "eternal":
      return {
        behind: [
          el("polygon", { points: star(48, 60, 64, 30, 8), fill: theme.goldHi, opacity: 0.55 }),
        ],
        front: [],
      };
    default:
      return {
        behind: [],
        front: [
          el("path", {
            d: "M70 22 L76 30 L70 34",
            fill: "none",
            stroke: theme.bgAbyss,
            "stroke-width": 2,
            opacity: 0.5,
          }),
        ],
      };
  }
}

/** Crest with its top-left at (x, y) and the given width (height = width × 1.25). */
export function crest(
  tier: TierId,
  division: 1 | 2 | 3 | null,
  stars: number | null,
  x: number,
  y: number,
  width: number,
  theme: Theme,
): SvgElement {
  const colour = theme.tiers[tier];
  const { behind, front } = ornament(tier, theme, colour);
  const label = division !== null ? ROMAN[division] : stars !== null ? String(stars) : "";
  return el(
    "g",
    {
      transform: `translate(${x} ${y}) scale(${Math.round((width / 96) * 1000) / 1000})`,
      "aria-hidden": "true",
    },
    [
      ...behind,
      el("path", {
        d: SHIELD,
        fill: colour,
        stroke: theme.gold,
        "stroke-width": tier === "eternal" ? 4 : 2.5,
      }),
      ...front,
      ...(label
        ? [
            el(
              "text",
              {
                x: 48,
                y: 74,
                "text-anchor": "middle",
                "font-size": label.length > 3 ? 18 : 28,
                "font-weight": 700,
                fill: theme.onGold,
              },
              [text(label)],
            ),
          ]
        : []),
    ],
  );
}
