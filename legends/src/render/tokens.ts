/**
 * Design tokens (visual-direction.md §3). Renderers take colours only from here, and the
 * validator rejects any colour that is not a token of the theme being rendered.
 */
import type { TierId } from "../engine/rules.ts";

export type ThemeId = "dark" | "light";

export interface Theme {
  id: ThemeId;
  bgAbyss: string;
  bgSurface: string;
  bgRaised: string;
  lineSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  gold: string;
  goldHi: string;
  teal: string;
  locked: string;
  /** Fog hatch: two alternating fills. */
  fogA: string;
  fogB: string;
  /** Text and glyphs drawn on a gold fill (checks, initials). */
  onGold: string;
  tiers: Readonly<Record<TierId, string>>;
}

export const DARK: Theme = {
  id: "dark",
  bgAbyss: "#0B1020",
  bgSurface: "#131B30",
  bgRaised: "#1B2542",
  lineSubtle: "#2A3556",
  textPrimary: "#E9EDF6",
  textSecondary: "#AEB8CE",
  textTertiary: "#8792AB",
  gold: "#E0B54E",
  goldHi: "#F3D98E",
  teal: "#4FD1C5",
  locked: "#5D6886",
  fogA: "#131B30",
  fogB: "#1B2542",
  onGold: "#0B1020",
  tiers: {
    initiate: "#9AA3B5",
    squire: "#C48A55",
    knight: "#A9BED3",
    warden: "#46BE90",
    champion: "#5C9AF5",
    paragon: "#A47CF0",
    ascendant: "#F08A6C",
    eternal: "#F6E3A1",
  },
};

/** Parchment light theme (VD-02). goldHi is fill-only; text that would use it uses gold. */
export const LIGHT: Theme = {
  id: "light",
  bgAbyss: "#F6F1E6",
  bgSurface: "#FFFFFF",
  bgRaised: "#EFE7D6",
  lineSubtle: "#D8CDB4",
  textPrimary: "#18203A",
  textSecondary: "#44506B",
  textTertiary: "#566079",
  gold: "#7A5912",
  goldHi: "#9C7420",
  teal: "#0E6A62",
  locked: "#6F7891",
  fogA: "#EFE7D6",
  fogB: "#E5DCC6",
  onGold: "#FFFFFF",
  tiers: {
    initiate: "#5E6677",
    squire: "#8A5A2B",
    knight: "#3F5A75",
    warden: "#1F7A57",
    champion: "#2357B8",
    paragon: "#6A3FC2",
    ascendant: "#A13F25",
    eternal: "#7D5A0C",
  },
};

export const THEMES: Readonly<Record<ThemeId, Theme>> = { dark: DARK, light: LIGHT };

/** Every colour a theme may emit (used by the validator). */
export function themeColours(theme: Theme): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(theme)) {
    if (key === "id") continue;
    if (typeof value === "string") out.add(value);
    else for (const c of Object.values(value as Record<string, string>)) out.add(c);
  }
  return out;
}

export const FONT_STACK = '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';
