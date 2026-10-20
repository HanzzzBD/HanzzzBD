/**
 * Card primitives (component-catalog C-02, C-04, C-07, C-08): shell, bar, stat tile.
 * Cards are 400 px wide (readme-layout §4), drawn with the typed builder and theme tokens.
 */
import { el, type SvgElement, type SvgNode, serialize, text } from "../svg.ts";
import { type FontSpec, textWidth, truncate } from "../text.ts";
import { FONT_STACK, type Theme } from "../tokens.ts";

export const CARD_WIDTH = 400;

export interface CardSpec {
  id: string;
  width?: number;
  height: number;
  overline: string;
  title: string;
  desc: string;
  sample: boolean;
  stale?: boolean;
  theme: Theme;
  body: SvgNode[];
  /** Right side of the overline row (e.g. "23 / 51 medals"). */
  aside?: string;
}

/** Serialises a complete card: <title>/<desc>, gradient shell, overline, watermark. */
export function card(spec: CardSpec): string {
  const width = spec.width ?? CARD_WIDTH;
  const { theme } = spec;
  const right = width - 20;
  const header: SvgElement[] = [
    el(
      "text",
      {
        x: 20,
        y: 28,
        "font-size": 11,
        "font-weight": 700,
        "letter-spacing": "0.1em",
        fill: theme.gold,
      },
      [text(spec.overline)],
    ),
  ];
  let asideRight = right;
  if (spec.sample) {
    header.push(
      el(
        "text",
        {
          x: right,
          y: 27,
          "text-anchor": "end",
          "font-size": 10,
          "letter-spacing": "0.15em",
          fill: theme.textTertiary,
        },
        [text("SAMPLE DATA")],
      ),
    );
    asideRight -= textWidth("SAMPLE DATA", { size: 10, tracking: 0.15 }) + 10;
  }
  if (spec.stale) {
    header.push(
      el(
        "text",
        {
          x: asideRight,
          y: 28,
          "text-anchor": "end",
          "font-size": 11,
          "font-weight": 700,
          fill: theme.gold,
        },
        [text("STALE")],
      ),
    );
    asideRight -= textWidth("STALE", { size: 11, bold: true }) + 10;
  }
  if (spec.aside)
    header.push(
      el(
        "text",
        { x: asideRight, y: 28, "text-anchor": "end", "font-size": 11, fill: theme.textSecondary },
        [text(spec.aside)],
      ),
    );
  const root = el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width,
      height: spec.height,
      viewBox: `0 0 ${width} ${spec.height}`,
      role: "img",
      "aria-labelledby": "t d",
      "font-family": FONT_STACK,
    },
    [
      el("title", { id: "t" }, [text(spec.title + (spec.sample ? " (sample data)" : ""))]),
      el("desc", { id: "d" }, [text(spec.desc)]),
      el("defs", {}, [
        el("linearGradient", { id: "surface", x1: 0, y1: 0, x2: 0, y2: 1 }, [
          el("stop", { offset: 0, "stop-color": theme.bgSurface }),
          el("stop", { offset: 1, "stop-color": theme.bgAbyss }),
        ]),
      ]),
      el("rect", {
        x: 0.5,
        y: 0.5,
        width: width - 1,
        height: spec.height - 1,
        rx: 14,
        fill: "url(#surface)",
        stroke: spec.stale ? theme.gold : theme.gold,
        "stroke-opacity": spec.stale ? 0.9 : 0.45,
      }),
      ...header,
      el("g", { id: spec.id }, spec.body),
    ],
  );
  return `${serialize(root)}\n`;
}

/** Progress bar (C-02): track + fill, percent clamped to 0–100. */
export function bar(
  x: number,
  y: number,
  width: number,
  height: number,
  percent: number,
  theme: Theme,
  fill = theme.gold,
): SvgElement {
  const p = Math.max(0, Math.min(100, percent));
  const w = Math.round((width * p) / 100);
  return el("g", {}, [
    el("rect", { x, y, width, height, rx: height / 2, fill: theme.bgRaised }),
    ...(w > 0
      ? [el("rect", { x, y, width: Math.max(height, w), height, rx: height / 2, fill })]
      : []),
  ]);
}

/** Stat tile (C-04): overline label and value; "—" when unavailable. */
export function statTile(
  x: number,
  y: number,
  width: number,
  label: string,
  value: string | null,
  theme: Theme,
): SvgElement {
  const shown = truncate(value ?? "—", width - 20, { size: 15, bold: true });
  return el("g", {}, [
    el("rect", { x, y, width, height: 50, rx: 8, fill: theme.bgRaised }),
    el(
      "text",
      {
        x: x + 10,
        y: y + 18,
        "font-size": 11,
        "font-weight": 700,
        "letter-spacing": "0.08em",
        fill: theme.textTertiary,
      },
      [text(label)],
    ),
    el(
      "text",
      {
        x: x + 10,
        y: y + 40,
        "font-size": 15,
        "font-weight": 700,
        fill: value === null ? theme.textSecondary : theme.textPrimary,
      },
      [text(shown)],
    ),
  ]);
}

/** Single-line text, truncated to `maxWidth`. */
export function line(
  x: number,
  y: number,
  value: string,
  maxWidth: number,
  font: FontSpec,
  fill: string,
  anchor: "start" | "middle" | "end" = "start",
): SvgElement {
  return el(
    "text",
    {
      x,
      y,
      "font-size": font.size,
      ...(font.bold ? { "font-weight": 700 } : {}),
      ...(anchor !== "start" ? { "text-anchor": anchor } : {}),
      fill,
    },
    [text(truncate(value, maxWidth, font))],
  );
}

/** Regular hexagon path (pointy top) centred on (cx, cy). */
export function hexagon(cx: number, cy: number, r: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${Math.round((cx + r * Math.cos(a)) * 100) / 100} ${Math.round((cy + r * Math.sin(a)) * 100) / 100}`;
  });
  return `M ${pts.join(" L ")} Z`;
}
