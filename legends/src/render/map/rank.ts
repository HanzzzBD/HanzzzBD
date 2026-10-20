/**
 * Rank marker (title band): a small heraldic shield in the tier colour (visual-direction
 * §3.3, §6) plus the rank and level as text, right-aligned. The text carries the meaning;
 * the colour only reinforces it.
 */

import { el, type SvgElement, text } from "../svg.ts";
import { type FontSpec, formatCount, textWidth, truncate } from "../text.ts";
import type { Theme } from "../tokens.ts";
import { glyph } from "./glyphs.ts";
import type { MapState } from "./schema.ts";

const TIER_NAMES: Readonly<Record<NonNullable<MapState["rank"]>["tier"], string>> = {
  initiate: "Initiate",
  squire: "Squire",
  knight: "Knight",
  warden: "Warden",
  champion: "Champion",
  paragon: "Paragon",
  ascendant: "Ascendant",
  eternal: "Eternal",
};
const ROMAN = { 1: "I", 2: "II", 3: "III" } as const;

/** "Champion II", "Eternal 1.2K★" style text (the star is drawn, not a font glyph). */
export function rankText(rank: MapState["rank"]): { label: string; starred: boolean } {
  if (!rank) return { label: "Unranked", starred: false };
  const name = TIER_NAMES[rank.tier];
  if (rank.division !== null) return { label: `${name} ${ROMAN[rank.division]}`, starred: false };
  return { label: `${name} ${formatCount(rank.stars)}`, starred: true };
}

export interface RankMarker {
  node: SvgElement;
  width: number;
}

const RANK_FONT: FontSpec = { size: 12, bold: true };
const LEVEL_FONT: FontSpec = { size: 12 };

/**
 * Right-aligned at `right`, text baseline at `baseline`. `maxWidth` bounds the whole marker;
 * the rank label is truncated first, the level text never.
 */
export function rankMarker(
  rank: MapState["rank"],
  level: number,
  right: number,
  baseline: number,
  maxWidth: number,
  theme: Theme,
): RankMarker {
  const levelText = `· Lv ${formatCount(level)}`;
  const levelWidth = textWidth(levelText, LEVEL_FONT);
  const { label, starred } = rankText(rank);
  const starSize = starred ? 11 : 0;
  const shieldWidth = 14;
  const gaps = 6 + 4 + (starred ? 2 : 0);
  const labelMax = Math.max(24, maxWidth - levelWidth - shieldWidth - starSize - gaps);
  const shown = truncate(label, labelMax, RANK_FONT);
  const labelWidth = textWidth(shown, RANK_FONT);
  const width = shieldWidth + 6 + labelWidth + (starred ? starSize + 2 : 0) + 4 + levelWidth;

  // Right to left: the shield at `right`, the level text, (the star,) then the label. Only
  // short strings are positioned by estimate, so visible gaps stay small on every font.
  const levelRight = right - shieldWidth - 6;
  const labelRight = levelRight - levelWidth - 4 - (starred ? starSize + 2 : 0);
  const tierColour = rank ? theme.tiers[rank.tier] : theme.locked;
  const children: SvgElement[] = [
    el(
      "text",
      {
        x: labelRight,
        y: baseline,
        "font-size": 12,
        "font-weight": 700,
        "text-anchor": "end",
        fill: theme.textPrimary,
      },
      [text(shown)],
    ),
  ];
  if (starred)
    children.push(
      glyph("star", labelRight + 2 + starSize / 2, baseline - 4, starSize, theme.goldHi, {
        fill: theme.goldHi,
        strokeWidth: 1,
      }),
    );
  children.push(
    el(
      "text",
      {
        x: levelRight,
        y: baseline,
        "font-size": 12,
        "text-anchor": "end",
        fill: theme.textSecondary,
      },
      [text(levelText)],
    ),
  );
  children.push(
    glyph("shield", right - shieldWidth / 2, baseline - 4.5, 16, theme.gold, {
      fill: tierColour,
      strokeWidth: 1.6,
    }),
  );
  return { node: el("g", { id: "rank-marker" }, children), width };
}
