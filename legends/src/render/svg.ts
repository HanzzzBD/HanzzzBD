/**
 * Minimal typed SVG builder (ADR-0010). Data never reaches markup as raw strings:
 * - element names and attribute names come from a fixed allow-list (checked at build time);
 * - attribute values and text are escaped at the serialisation boundary;
 * - numbers are written with fixed precision, attributes in sorted order, so identical
 *   input always produces byte-identical output.
 */

export type AttrValue = string | number;
export type Attrs = Readonly<Record<string, AttrValue | undefined>>;

export interface SvgElement {
  readonly kind: "element";
  readonly tag: string;
  readonly attrs: Attrs;
  readonly children: readonly SvgNode[];
}
export interface SvgText {
  readonly kind: "text";
  readonly value: string;
}
export type SvgNode = SvgElement | SvgText;

const PRESENTATION = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "transform",
] as const;
const TEXT_ATTRS = [
  "x",
  "y",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
] as const;

/** Allowed elements and their attributes. Nothing else can be built or will pass validation. */
export const SVG_ALLOW: Readonly<Record<string, readonly string[]>> = {
  svg: ["xmlns", "width", "height", "viewBox", "role", "aria-labelledby", ...TEXT_ATTRS],
  title: ["id"],
  desc: ["id"],
  defs: [],
  g: ["id", "aria-hidden", ...PRESENTATION, ...TEXT_ATTRS],
  rect: ["id", "x", "y", "width", "height", "rx", ...PRESENTATION],
  circle: ["id", "cx", "cy", "r", ...PRESENTATION],
  line: ["x1", "y1", "x2", "y2", ...PRESENTATION],
  path: ["id", "d", ...PRESENTATION],
  polygon: ["points", ...PRESENTATION],
  text: ["id", ...TEXT_ATTRS, ...PRESENTATION],
  radialGradient: ["id", "cx", "cy", "r"],
  linearGradient: ["id", "x1", "y1", "x2", "y2"],
  stop: ["offset", "stop-color", "stop-opacity"],
  pattern: ["id", "width", "height", "patternUnits", "patternTransform"],
};

export class SvgBuildError extends Error {}

export function el(tag: string, attrs: Attrs = {}, children: readonly SvgNode[] = []): SvgElement {
  const allowed = SVG_ALLOW[tag];
  if (!allowed) throw new SvgBuildError(`element not allowed: ${tag}`);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (!allowed.includes(name)) throw new SvgBuildError(`attribute not allowed: ${tag}@${name}`);
    if (typeof value === "number" && !Number.isFinite(value))
      throw new SvgBuildError(`non-finite number: ${tag}@${name}`);
  }
  return { kind: "element", tag, attrs, children };
}

/** A text node. The value is escaped on serialisation, never interpreted. */
export function text(value: string): SvgText {
  return { kind: "text", value };
}

/** Fixed-precision number: at most 2 decimals, no trailing zeros, no "-0". */
export function num(n: number): string {
  if (!Number.isFinite(n)) throw new SvgBuildError("non-finite number");
  const s = (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function attrString(value: AttrValue): string {
  return typeof value === "number" ? num(value) : value;
}

/** Canonical serialisation: sorted attributes, escaped values, no whitespace between nodes. */
export function serialize(node: SvgNode): string {
  if (node.kind === "text") return escapeText(node.value);
  const attrs = Object.entries(node.attrs)
    .filter((entry): entry is [string, AttrValue] => entry[1] !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => ` ${name}="${escapeAttr(attrString(value))}"`)
    .join("");
  if (node.children.length === 0) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map(serialize).join("")}</${node.tag}>`;
}

/** Path data from numbers only (commands are literals chosen by the renderer). */
export function pathData(parts: ReadonlyArray<string | number>): string {
  return parts.map((p) => (typeof p === "number" ? num(p) : p)).join(" ");
}
