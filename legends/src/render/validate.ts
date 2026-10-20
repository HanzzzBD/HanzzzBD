/**
 * Post-render SVG validator (ADR-0010, map-specification §12). It re-parses the output with a
 * strict parser, independent of the builder, and rejects anything outside the allow-list:
 * unknown elements or attributes, scripts, event handlers, external or dangling references,
 * colours outside the theme tokens, malformed transforms, unsafe characters, text outside
 * the canvas, and size-budget overruns.
 */
import { SVG_ALLOW } from "./svg.ts";
import { textWidth } from "./text.ts";
import { type Theme, themeColours } from "./tokens.ts";

export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: Array<XmlElement | string>;
}

export class SvgParseError extends Error {}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
};

function decode(raw: string): string {
  return raw.replace(/&([a-z0-9#]+);|&/g, (match, name: string | undefined) => {
    const value = name ? ENTITIES[name] : undefined;
    if (value === undefined) throw new SvgParseError(`invalid entity ${match}`);
    return value;
  });
}

/** Strict parser for the canonical subset the builder emits (no comments, PIs, CDATA or DTD). */
export function parseSvg(source: string): XmlElement {
  let i = 0;
  const fail = (message: string): never => {
    throw new SvgParseError(`${message} at ${i}`);
  };
  const name = () => {
    const m = /^[A-Za-z][A-Za-z0-9-]*/.exec(source.slice(i));
    if (!m) return fail("expected a name");
    i += m[0].length;
    return m[0];
  };
  const element = (): XmlElement => {
    if (source[i] !== "<") fail("expected <");
    i++;
    if (source[i] === "!" || source[i] === "?")
      fail("comments, declarations and PIs are not allowed");
    const tag = name();
    const attrs: Record<string, string> = {};
    for (;;) {
      if (source.startsWith("/>", i)) {
        i += 2;
        return { tag, attrs, children: [] };
      }
      if (source[i] === ">") {
        i++;
        break;
      }
      if (source[i] !== " ") fail("expected attribute");
      i++;
      const attr = name();
      if (!source.startsWith('="', i)) fail("attribute values must be double-quoted");
      i += 2;
      const end = source.indexOf('"', i);
      if (end < 0) fail("unterminated attribute");
      const raw = source.slice(i, end);
      if (raw.includes("<")) fail("< in attribute");
      if (attr in attrs) fail(`duplicate attribute ${attr}`);
      attrs[attr] = decode(raw);
      i = end + 1;
    }
    const children: XmlElement["children"] = [];
    for (;;) {
      if (i >= source.length) fail(`unclosed <${tag}>`);
      if (source.startsWith("</", i)) {
        i += 2;
        const close = name();
        if (close !== tag) fail(`mismatched </${close}>`);
        if (source[i] !== ">") fail("expected >");
        i++;
        return { tag, attrs, children };
      }
      if (source[i] === "<") children.push(element());
      else {
        const end = source.indexOf("<", i);
        if (end < 0) fail("unterminated text");
        children.push(decode(source.slice(i, end)));
        i = end;
      }
    }
  };
  const root = element();
  if (source.slice(i).trim() !== "") fail("content after the root element");
  return root;
}

export interface SvgIssue {
  code: string;
  detail: string;
}

export interface SvgRules {
  theme: Theme;
  width: number;
  height: number;
  maxBytes: number;
  minFontSize?: number;
  /** Colours allowed besides the theme tokens (catalog palettes). Defaults to tokens only. */
  palette?: ReadonlySet<string>;
  viewBox?: string;
}

const UNSAFE_CHARS = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
const NUMBER = /^-?\d+(\.\d+)?$/;
const NUMERIC_ATTRS = new Set([
  "x",
  "y",
  "width",
  "height",
  "rx",
  "cx",
  "cy",
  "r",
  "x1",
  "y1",
  "x2",
  "y2",
  "stroke-width",
  "font-size",
  "opacity",
  "stroke-opacity",
  "fill-opacity",
  "offset",
]);
const TRANSFORM = /^(?:\s*(?:translate|scale|rotate)\(-?\d+(?:\.\d+)?(?: -?\d+(?:\.\d+)?)?\))+$/;
const PATH_DATA = /^[MLHVCSQTAZmlhvcsqtaz0-9 .,-]+$/;
const POINTS = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?( -?\d+(\.\d+)?,-?\d+(\.\d+)?)*$/;
const URL_REF = /^url\(#([A-Za-z][A-Za-z0-9_-]*)\)$/;

export function validateSvg(source: string, rules: SvgRules): SvgIssue[] {
  const issues: SvgIssue[] = [];
  const add = (code: string, detail: string) => issues.push({ code, detail });
  const bytes = Buffer.byteLength(source, "utf8");
  if (bytes > rules.maxBytes) add("size_budget", `${bytes} bytes > ${rules.maxBytes}`);

  let root: XmlElement;
  try {
    root = parseSvg(source);
  } catch (error) {
    add("malformed", error instanceof Error ? error.message : "parse error");
    return issues;
  }
  if (root.tag !== "svg") add("root", "root element must be <svg>");
  if (root.attrs.xmlns !== "http://www.w3.org/2000/svg") add("root", "missing SVG namespace");
  if (root.attrs.viewBox !== `0 0 ${rules.width} ${rules.height}`)
    add("root", "unexpected viewBox");
  if (root.attrs.role !== "img") add("a11y", 'root needs role="img"');

  const colours = rules.palette ?? themeColours(rules.theme);
  const ids = new Set<string>();
  const refs: string[] = [];
  const all: XmlElement[] = [];
  const walk = (node: XmlElement, inheritedSize: number, inheritedWeight: string) => {
    all.push(node);
    const allowed = SVG_ALLOW[node.tag];
    if (!allowed) add("element", `<${node.tag}> is not allowed`);
    for (const [attr, value] of Object.entries(node.attrs)) {
      if (attr.startsWith("on")) add("event_handler", `${node.tag}@${attr}`);
      else if (!allowed?.includes(attr)) add("attribute", `${node.tag}@${attr} is not allowed`);
      if (UNSAFE_CHARS.test(value)) add("unsafe_char", `${node.tag}@${attr}`);
      if (attr === "id") {
        if (ids.has(value)) add("duplicate_id", value);
        ids.add(value);
      }
      if (NUMERIC_ATTRS.has(attr) && !NUMBER.test(value))
        add("number", `${node.tag}@${attr}=${value}`);
      if (attr === "transform" || attr === "patternTransform")
        if (!TRANSFORM.test(value)) add("transform", value);
      if (attr === "d" && !PATH_DATA.test(value)) add("path_data", node.tag);
      if (attr === "points" && !POINTS.test(value)) add("points", node.tag);
      if (attr === "fill" || attr === "stroke" || attr === "stop-color") {
        const ref = URL_REF.exec(value);
        if (ref?.[1]) refs.push(ref[1]);
        else if (value !== "none" && !colours.has(value))
          add("colour", `${node.tag}@${attr}=${value} is not a ${rules.theme.id} token`);
      } else if (value.includes("url(")) add("external_reference", `${node.tag}@${attr}`);
    }
    const size = node.attrs["font-size"] ? Number(node.attrs["font-size"]) : inheritedSize;
    const weight = node.attrs["font-weight"] ?? inheritedWeight;
    if (node.tag === "text") {
      const content = node.children.filter((c): c is string => typeof c === "string").join("");
      if (UNSAFE_CHARS.test(content)) add("unsafe_char", "text content");
      if (content.trim() === "") add("empty_text", "text element without content");
      if (size < (rules.minFontSize ?? 10)) add("font_size", `${size}px "${content.slice(0, 20)}"`);
      const x = Number(node.attrs.x ?? 0);
      const y = Number(node.attrs.y ?? 0);
      const w = textWidth(content, { size, bold: weight === "700" });
      const anchor = node.attrs["text-anchor"] ?? "start";
      const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      if (left < 0 || left + w > rules.width || y - size < 0 || y > rules.height)
        add("text_bounds", `"${content.slice(0, 24)}" exceeds the canvas`);
    }
    for (const child of node.children)
      if (typeof child !== "string") walk(child, size, weight);
      else if (
        child.trim() !== "" &&
        node.tag !== "text" &&
        node.tag !== "title" &&
        node.tag !== "desc"
      )
        add("stray_text", `text inside <${node.tag}>`);
  };
  walk(root, 16, "400");

  for (const ref of refs) if (!ids.has(ref)) add("dangling_reference", `#${ref}`);
  for (const id of (root.attrs["aria-labelledby"] ?? "").split(" ").filter(Boolean))
    if (!ids.has(id)) add("a11y", `aria-labelledby references missing #${id}`);
  const title = all.find((n) => n.tag === "title");
  const desc = all.find((n) => n.tag === "desc");
  if (!title || title.children.join("").trim() === "") add("a11y", "missing <title>");
  if (!desc || desc.children.join("").trim() === "") add("a11y", "missing <desc>");
  return issues;
}

export interface BoxLike {
  kind: string;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** For markers drawn on a plaque's edge: that plaque's id. */
  owner?: string;
}

/** Bounding-box lint: overlapping layout boxes, and plaques closer than `plaqueGap`. */
export function overlapIssues(
  boxes: readonly BoxLike[],
  plaqueGap = 16,
  canvas = { width: 420, height: 820 },
): SvgIssue[] {
  const issues: SvgIssue[] = [];
  const gapBetween = (a: BoxLike, b: BoxLike) =>
    Math.max(
      b.x - (a.x + a.width),
      a.x - (b.x + b.width),
      b.y - (a.y + a.height),
      a.y - (b.y + b.height),
    );
  for (const b of boxes)
    if (b.x < 0 || b.y < 0 || b.x + b.width > canvas.width || b.y + b.height > canvas.height)
      issues.push({ code: "box_bounds", detail: `${b.kind}:${b.id}` });
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i] as BoxLike;
      const b = boxes[j] as BoxLike;
      const gap = gapBetween(a, b);
      const required = a.kind === "plaque" && b.kind === "plaque" ? plaqueGap : 0;
      // Markers sit on their own plaque's edge by design (pin, quest marker, pennant).
      const attached = (m: BoxLike, p: BoxLike) => p.kind === "plaque" && m.owner === p.id;
      if (attached(a, b) || attached(b, a)) continue;
      if (gap < required)
        issues.push({
          code: "overlap",
          detail: `${a.kind}:${a.id} / ${b.kind}:${b.id} (gap ${Math.round(gap)})`,
        });
    }
  return issues;
}
