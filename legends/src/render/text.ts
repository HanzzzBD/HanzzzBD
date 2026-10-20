/**
 * Text fitting for SVGs rendered through <img>, where the viewer's system font is used
 * (VD-03). Widths come from a conservative table (the widest of Segoe UI, SF and Helvetica
 * metrics, plus 8%), so a label that "fits" here fits on every platform.
 */

const NARROW = new Set("iIjl!|.,:;'`");
const SEMI = new Set('fJrt()[]{}/\\-"');
const WIDE = new Set("MW@%mw");

function charEm(ch: string): number {
  if (ch === " ") return 0.3;
  if (NARROW.has(ch)) return 0.3;
  if (SEMI.has(ch)) return 0.4;
  if (WIDE.has(ch)) return 0.95;
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[A-Z]/.test(ch)) return 0.74;
  if (/[a-z]/.test(ch)) return 0.58;
  if (ch.charCodeAt(0) < 0x80) return 0.6;
  if (ch === "…") return 1.0;
  if (/[\p{P}\p{S}]/u.test(ch) && ch.charCodeAt(0) < 0x2000) return 0.5; // ·, «, ×, …
  if (/\p{Script=Latin}|\p{Script=Greek}|\p{Script=Cyrillic}/u.test(ch)) return 0.76;
  return 1.05; // CJK, emoji and anything unknown: assume full width
}

const graphemes = (s: string): string[] =>
  Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s), (x) => x.segment);

export interface FontSpec {
  size: number;
  bold?: boolean;
  /** Letter spacing in em. */
  tracking?: number;
}

/** Conservative rendered width in px. */
export function textWidth(value: string, font: FontSpec): number {
  let em = 0;
  for (const g of graphemes(value)) em += charEm(Array.from(g)[0] ?? " ") + (font.tracking ?? 0);
  return em * font.size * (font.bold ? 1.08 : 1) * 1.08;
}

/** Truncates with "…" so the result fits `maxWidth`. Never splits a grapheme. */
export function truncate(value: string, maxWidth: number, font: FontSpec): string {
  if (textWidth(value, font) <= maxWidth) return value;
  const parts = graphemes(value);
  while (parts.length > 0) {
    parts.pop();
    const candidate = `${parts.join("").trimEnd()}…`;
    if (textWidth(candidate, font) <= maxWidth) return candidate;
  }
  return "…";
}

export interface FittedLabel {
  text: string;
  size: number;
  truncated: boolean;
}

/**
 * Fits a label: the full name at each allowed size, then the short label, then the full
 * name truncated at the smallest size.
 */
export function fitLabel(
  full: string,
  short: string | null,
  maxWidth: number,
  sizes: readonly number[],
  bold = true,
): FittedLabel {
  for (const size of sizes)
    if (textWidth(full, { size, bold }) <= maxWidth) return { text: full, size, truncated: false };
  for (const size of sizes)
    if (short && textWidth(short, { size, bold }) <= maxWidth)
      return { text: short, size, truncated: false };
  const size = sizes.at(-1) ?? 12;
  return { text: truncate(short ?? full, maxWidth, { size, bold }), size, truncated: true };
}

/**
 * Untrusted display text (player names): NFC, no control or format characters (this removes
 * bidirectional overrides that could disguise text), single spaces, bounded length.
 */
export function sanitizeLabel(value: string, maxGraphemes = 64): string {
  const cleaned = value
    .normalize("NFC")
    .replace(/[\t\n\v\f\r\u2028\u2029]/gu, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return graphemes(cleaned).slice(0, maxGraphemes).join("");
}

/** Removes emoji and pictographs (visual-direction §5: no emoji inside SVGs). */
export function stripPictographs(value: string): string {
  return value.replace(
    /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0E\uFE0F\u20E3]/gu,
    "",
  );
}

/** Up to two letters or digits from the first two words, upper-cased; "?" when none. */
export function initials(name: string): string {
  const words = sanitizeLabel(name).split(" ");
  const letters = words
    .map((w) => graphemes(w).find((g) => /^[\p{L}\p{N}]/u.test(g)))
    .filter((g): g is string => g !== undefined)
    .slice(0, 2);
  return letters.length > 0 ? letters.join("").toLocaleUpperCase("en") : "?";
}

/** Compact, never overstated counts: 9,999 · 12.3K · 4.5M · 1.2B (floored). */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "?";
  const sign = n < 0 ? "-" : "";
  const v = Math.floor(Math.abs(n));
  const floor1 = (x: number) => (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (v < 10_000) return sign + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (v < 1_000_000) return `${sign}${floor1(v / 1_000)}K`;
  if (v < 1_000_000_000) return `${sign}${floor1(v / 1_000_000)}M`;
  return `${sign}${floor1(v / 1_000_000_000)}B`;
}
