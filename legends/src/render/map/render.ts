/**
 * World map SVG renderer (map-specification.md, component C-50). Input is a validated
 * `MapState`; output is a deterministic SVG string plus the layout boxes used by the
 * overlap lint. Region names, checkpoint labels and glyphs come from the catalog; the only
 * free text is the sanitised player name, which is escaped by the builder.
 */
import { el, pathData, type SvgElement, type SvgNode, serialize, text } from "../svg.ts";
import { type FontSpec, fitLabel, formatCount, textWidth, truncate } from "../text.ts";
import { FONT_STACK, type Theme } from "../tokens.ts";
import {
  CANVAS,
  DOMAIN_PLAQUE,
  EMBLEM_LABELS,
  MAIN_PLAQUE,
  MAIN_REGION_IDS,
  plaqueBox,
  REGIONS,
  type RegionDef,
  regionDef,
} from "./catalog.ts";
import { checkpointNode, checkpointRow } from "./checkpoint.ts";
import { glyph, motif } from "./glyphs.ts";
import { rankMarker } from "./rank.ts";
import { type MapState, parseMapState, type RegionStateValue } from "./schema.ts";
import { mapDescription, mapTitle, nextText } from "./text.ts";

export interface Box {
  kind: "plaque" | "chip" | "pin" | "quest" | "pennant" | "title" | "progress" | "legend";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** For markers drawn on a plaque's edge: that plaque's id. */
  owner?: string;
}

export interface RenderedMap {
  svg: string;
  boxes: Box[];
}

const LEFT = CANVAS.margin + 8;
const RIGHT = CANVAS.width - CANVAS.margin - 8;
const highlight = (t: Theme) => (t.id === "light" ? t.gold : t.goldHi);
const t11: FontSpec = { size: 11 };

/** Fixed decorative stars in the sky (dark theme), placed in gaps between plaques. */
const STARS: ReadonlyArray<[number, number, number]> = [
  [36, 74, 1.1],
  [300, 70, 0.9],
  [392, 96, 1.2],
  [26, 128, 0.8],
  [392, 214, 0.9],
  [176, 186, 1],
  [20, 300, 1.1],
  [240, 296, 0.8],
  [398, 290, 0.9],
  [248, 392, 1],
  [30, 372, 0.8],
  [400, 420, 1.1],
  [176, 420, 0.9],
  [20, 520, 1],
  [300, 520, 0.8],
  [400, 512, 0.9],
  [252, 600, 1],
  [24, 720, 0.9],
  [380, 700, 1.1],
  [100, 728, 0.8],
];

function road(state: MapState, theme: Theme): SvgElement[] {
  const points = MAIN_REGION_IDS.map((id) => regionDef(id));
  const segment = (from: number, to: number) => {
    const parts: Array<string | number> = ["M", points[from]?.x ?? 0, points[from]?.y ?? 0];
    for (let i = from + 1; i <= to; i++) {
      const a = points[i - 1] as RegionDef;
      const b = points[i] as RegionDef;
      const mid = (a.y + b.y) / 2;
      parts.push("C", a.x, mid, b.x, mid, b.x, b.y);
    }
    return pathData(parts);
  };
  const last = points.length - 1;
  const current = MAIN_REGION_IDS.indexOf(state.current);
  const out = [
    el("path", {
      d: segment(0, last),
      fill: "none",
      stroke: theme.lineSubtle,
      "stroke-width": 10,
      "stroke-linecap": "round",
    }),
  ];
  if (current > 0)
    out.push(
      el("path", {
        d: segment(0, current),
        fill: "none",
        stroke: theme.gold,
        "stroke-width": 4,
        "stroke-linecap": "round",
      }),
    );
  if (current < last)
    out.push(
      el("path", {
        d: segment(current, last),
        fill: "none",
        stroke: theme.locked,
        "stroke-width": 2,
        "stroke-dasharray": "2 8",
        "stroke-linecap": "round",
      }),
    );
  return out;
}

function lockLine(
  label: string,
  cx: number,
  cy: number,
  maxWidth: number,
  theme: Theme,
): SvgElement {
  const shown = truncate(label, maxWidth - 16, t11);
  const w = 12 + 4 + textWidth(shown, t11);
  const left = cx - w / 2;
  return el("g", {}, [
    glyph("lock", left + 6, cy - 0.5, 12, theme.textSecondary),
    el("text", { x: left + 16, y: cy + 4, "font-size": 11, fill: theme.textSecondary }, [
      text(shown),
    ]),
  ]);
}

function plaque(def: RegionDef, region: RegionStateValue, theme: Theme): SvgElement {
  const box = plaqueBox(def);
  const main = def.kind === "main";
  const size = main ? MAIN_PLAQUE : DOMAIN_PLAQUE;
  const accent = main ? theme.gold : theme.teal;
  const locked = region.state === "locked";
  const rim: Record<string, string | number> = locked
    ? { stroke: theme.locked, "stroke-width": 1, "stroke-dasharray": "4 3" }
    : region.state === "current"
      ? { stroke: highlight(theme), "stroke-width": 2 }
      : region.state === "completed"
        ? { stroke: accent, "stroke-width": 2 }
        : { stroke: accent, "stroke-width": 1.2, "stroke-opacity": 0.8 };
  const children: SvgNode[] = [
    el("rect", {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rx: size.radius,
      fill: locked ? "url(#fog)" : theme.bgRaised,
      ...rim,
    }),
  ];
  const nameY = box.y + (main ? 22 : 19);
  const rowY = box.y + (main ? 40 : 34);
  const label = fitLabel(def.name, def.short, box.width - 12, main ? [14, 13, 12] : [12, 11]);
  const nameFill = locked
    ? theme.textSecondary
    : region.state === "completed"
      ? highlight(theme)
      : theme.textPrimary;
  children.push(
    el(
      "text",
      {
        x: def.x,
        y: nameY,
        "text-anchor": "middle",
        "font-size": label.size,
        "font-weight": 700,
        fill: nameFill,
      },
      [text(label.text)],
    ),
  );
  if (locked) {
    // Domain plaques are narrow: "Lv 10" next to the lock reads the same as "Unlocks at Lv 10".
    const gate = main
      ? `Unlocks at Lv ${def.gateLevel}`
      : region.missing === "level"
        ? `Lv ${def.gateLevel}`
        : `${EMBLEM_LABELS[def.emblem ?? "frontend"]} L1`;
    children.push(lockLine(gate, def.x, rowY, box.width - 16, theme));
  } else {
    const kinds = def.checkpoints.map((c) => c.kind);
    children.push(motif(def.motif, box.x + (main ? 18 : 15), rowY, main ? 16 : 13, accent));
    children.push(checkpointRow(kinds, region.checkpoints, def.x, rowY, accent, theme));
    const n = region.checkpoints.filter((c) => c.status === "cleared").length;
    children.push(
      el(
        "text",
        {
          x: box.x + box.width - (main ? 12 : 9),
          y: rowY + 4,
          "text-anchor": "end",
          "font-size": 11,
          fill: theme.textSecondary,
        },
        [text(`${n}/3`)],
      ),
    );
  }
  if (region.state === "completed")
    children.push(
      glyph("pennant", box.x + box.width - 12, box.y - 4, 16, accent, {
        fill: accent,
        strokeWidth: 1.5,
      }),
    );
  return el("g", { id: `region-${def.id}` }, children);
}

/** Two initials when they fit the pin head, otherwise the first one. */
function pinInitials(value: string): string {
  if (textWidth(value, { size: 10, bold: true }) <= 18) return value;
  return (
    Array.from(
      new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value),
      (g) => g.segment,
    )[0] ?? "?"
  );
}

/** Pin with initials at the left edge of the current plaque, ring, "Next" chip, quest marker. */
function currentMarkers(state: MapState, theme: Theme, boxes: Box[]): SvgElement[] {
  const def = regionDef(state.current);
  const box = plaqueBox(def);
  const out: SvgElement[] = [];
  out.push(
    el("rect", {
      x: box.x - 5,
      y: box.y - 5,
      width: box.width + 10,
      height: box.height + 10,
      rx: MAIN_PLAQUE.radius + 5,
      fill: "none",
      stroke: theme.goldHi,
      "stroke-opacity": 0.35,
      "stroke-width": 5,
    }),
  );
  // "Next" chip, with the quest marker (active quests today and this week) beside it.
  const chipText = truncate(`Next: ${nextText(state, true)}`, 236, t11);
  const chipW = textWidth(chipText, t11) + 20;
  const chipH = 20;
  const count = state.quests.active > 99 ? "99+" : formatCount(state.quests.active);
  const questW =
    state.quests.active > 0 ? 16 + 4 + textWidth(count, { size: 11, bold: true }) + 10 : 0;
  const groupW = chipW + (questW > 0 ? 6 + questW : 0);
  const chipY = def.chip === "above" ? box.y - 8 - chipH : box.y + box.height + 8;
  // Above a completed plaque, keep clear of its pennant (top-right corner).
  const completed = state.regions.find((r) => r.id === def.id)?.state === "completed";
  const maxRight =
    completed && def.chip === "above" ? box.x + box.width - 24 : CANVAS.width - CANVAS.margin;
  const chipX = Math.max(Math.min(def.x - groupW / 2, maxRight - groupW), CANVAS.margin);
  out.push(
    el("g", { id: "next-chip" }, [
      el("rect", {
        x: chipX,
        y: chipY,
        width: chipW,
        height: chipH,
        rx: 10,
        fill: theme.bgAbyss,
        stroke: theme.gold,
        "stroke-opacity": 0.6,
      }),
      el(
        "text",
        {
          x: chipX + chipW / 2,
          y: chipY + 14,
          "text-anchor": "middle",
          "font-size": 11,
          fill: theme.textPrimary,
        },
        [text(chipText)],
      ),
    ]),
  );
  boxes.push({ kind: "chip", id: "next", x: chipX, y: chipY, width: chipW, height: chipH });
  if (questW > 0) {
    const qx = chipX + chipW + 6;
    out.push(
      el("g", { id: "quest-marker" }, [
        el("rect", {
          x: qx,
          y: chipY,
          width: questW,
          height: chipH,
          rx: 10,
          fill: theme.bgAbyss,
          stroke: theme.gold,
          "stroke-width": 1.2,
        }),
        glyph("scroll", qx + 13, chipY + 10, 13, theme.gold),
        el(
          "text",
          {
            x: qx + 23,
            y: chipY + 14,
            "font-size": 11,
            "font-weight": 700,
            fill: theme.textPrimary,
          },
          [text(count)],
        ),
      ]),
    );
    boxes.push({ kind: "quest", id: "quests", x: qx, y: chipY, width: questW, height: chipH });
  }
  // Player pin.
  const pinSize = 30;
  const pinX = box.x;
  const pinY = def.y - 9;
  out.push(
    el("g", { id: "player-marker" }, [
      glyph("pin", pinX, pinY, pinSize, theme.bgAbyss, { fill: theme.gold, strokeWidth: 1.5 }),
      el(
        "text",
        {
          x: pinX,
          y: pinY - 1,
          "text-anchor": "middle",
          "font-size": 10,
          "font-weight": 700,
          fill: theme.onGold,
        },
        [text(pinInitials(state.player.initials))],
      ),
    ]),
  );
  boxes.push({
    kind: "pin",
    id: "player",
    owner: def.id,
    x: pinX - pinSize / 2,
    y: pinY - pinSize / 2,
    width: pinSize,
    height: pinSize,
  });
  return out;
}

function titleBand(state: MapState, theme: Theme, boxes: Box[]): SvgElement[] {
  const out: SvgElement[] = [
    el(
      "text",
      {
        x: LEFT,
        y: 26,
        "font-size": 13,
        "font-weight": 700,
        "letter-spacing": "0.1em",
        fill: theme.gold,
      },
      [text("THE REALMS")],
    ),
  ];
  let right = RIGHT;
  if (state.sample) {
    out.push(
      el(
        "text",
        {
          x: right,
          y: 25,
          "text-anchor": "end",
          "font-size": 10,
          "letter-spacing": "0.15em",
          fill: theme.textTertiary,
        },
        [text("SAMPLE DATA")],
      ),
    );
    right -= textWidth("SAMPLE DATA", { size: 10, tracking: 0.15 }) + 10;
  }
  if (state.stale) {
    const w = textWidth("Stale data", t11) + 16;
    out.push(
      el("g", { id: "stale-chip" }, [
        el("rect", {
          x: right - w,
          y: 12,
          width: w,
          height: 18,
          rx: 9,
          fill: theme.bgRaised,
          stroke: theme.gold,
          "stroke-opacity": 0.6,
        }),
        el(
          "text",
          {
            x: right - w / 2,
            y: 25,
            "text-anchor": "middle",
            "font-size": 11,
            fill: theme.textPrimary,
          },
          [text("Stale data")],
        ),
      ]),
    );
  }
  const marker = rankMarker(state.rank, state.player.level, RIGHT, 47, 250, theme);
  const nameMax = RIGHT - LEFT - marker.width - 12;
  const name = truncate(state.player.name, nameMax, { size: 15, bold: true });
  out.push(
    el("text", { x: LEFT, y: 47, "font-size": 15, "font-weight": 700, fill: theme.textPrimary }, [
      text(name),
    ]),
  );
  out.push(marker.node);
  boxes.push({
    kind: "title",
    id: "name",
    x: LEFT,
    y: 34,
    width: textWidth(name, { size: 15, bold: true }),
    height: 18,
  });
  boxes.push({
    kind: "title",
    id: "rank",
    x: RIGHT - marker.width,
    y: 34,
    width: marker.width,
    height: 18,
  });
  return out;
}

function progressBand(state: MapState, theme: Theme, boxes: Box[]): SvgElement[] {
  const y = 764;
  const width = RIGHT - LEFT;
  const nextRegion = REGIONS.find(
    (d) => d.kind === "main" && state.regions.find((r) => r.id === d.id)?.state === "locked",
  );
  const value =
    state.progress.kind === "level"
      ? `Lv ${formatCount(state.player.level)} / ${nextRegion?.gateLevel ?? "?"} · ${state.progress.percent}%`
      : `${state.progress.current}/${state.progress.target} · ${state.progress.percent}%`;
  const valueWidth = textWidth(value, { size: 11, bold: true });
  const caption =
    state.progress.kind === "level" && nextRegion
      ? `Next region: ${nextRegion.name}`
      : "All regions unlocked · checkpoints";
  const shownCaption = truncate(caption, width - valueWidth - 10, t11);
  const fillWidth = Math.round((width * state.progress.percent) / 100);
  const out: SvgElement[] = [
    el("text", { x: LEFT, y, "font-size": 11, fill: theme.textSecondary }, [text(shownCaption)]),
    el(
      "text",
      {
        x: RIGHT,
        y,
        "text-anchor": "end",
        "font-size": 11,
        "font-weight": 700,
        fill: highlight(theme),
      },
      [text(value)],
    ),
    el("rect", { x: LEFT, y: y + 6, width, height: 6, rx: 3, fill: theme.lineSubtle }),
  ];
  if (fillWidth > 0)
    out.push(
      el("rect", {
        x: LEFT,
        y: y + 6,
        width: Math.max(6, fillWidth),
        height: 6,
        rx: 3,
        fill: theme.gold,
      }),
    );
  boxes.push({ kind: "progress", id: "progress", x: LEFT, y: y - 11, width, height: 23 });
  return [el("g", { id: "progress" }, out)];
}

function legend(theme: Theme, boxes: Box[]): SvgElement[] {
  const y = 796;
  const items: Array<{ label: string; icon: (x: number) => SvgElement }> = [
    {
      label: "Cleared",
      icon: (x) => checkpointNode("standard", "cleared", x, y - 4, theme.gold, theme),
    },
    { label: "Open", icon: (x) => checkpointNode("standard", "open", x, y - 4, theme.gold, theme) },
    { label: "Rank", icon: (x) => checkpointNode("rank", "open", x, y - 4, theme.gold, theme) },
    { label: "Quest", icon: (x) => checkpointNode("quest", "open", x, y - 4, theme.gold, theme) },
    {
      label: "Domain",
      icon: (x) => checkpointNode("standard", "cleared", x, y - 4, theme.teal, theme),
    },
    { label: "Locked", icon: (x) => glyph("lock", x, y - 4.5, 12, theme.textSecondary) },
  ];
  const out: SvgElement[] = [];
  let x = LEFT;
  for (const item of items) {
    out.push(item.icon(x + 5));
    out.push(
      el("text", { x: x + 14, y, "font-size": 11, fill: theme.textSecondary }, [text(item.label)]),
    );
    x += 14 + textWidth(item.label, t11) + 12;
  }
  out.push(
    el("text", { x: LEFT, y: 812, "font-size": 11, fill: theme.textTertiary }, [
      text("Pin = you are here. Full region list below the map."),
    ]),
  );
  boxes.push({ kind: "legend", id: "legend", x: LEFT, y: y - 11, width: x - LEFT, height: 30 });
  return [el("g", { id: "legend" }, out)];
}

/** Renders a validated map state. Unvalidated input is rejected by `parseMapState`. */
export function renderMap(input: MapState, theme: Theme): RenderedMap {
  const state = parseMapState(input);
  const boxes: Box[] = [];
  const byId = new Map(state.regions.map((r) => [r.id, r]));
  const visible = REGIONS.filter((d) => byId.get(d.id)?.state !== "hidden");
  for (const def of visible) boxes.push({ kind: "plaque", id: def.id, ...plaqueBox(def) });

  const defs = el("defs", {}, [
    el("radialGradient", { id: "sky", cx: 0.5, cy: 0.85, r: 1 }, [
      el("stop", { offset: 0, "stop-color": theme.bgRaised }),
      el("stop", { offset: 1, "stop-color": theme.bgAbyss }),
    ]),
    el(
      "pattern",
      {
        id: "fog",
        width: 8,
        height: 8,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(45)",
      },
      [
        el("rect", { width: 8, height: 8, fill: theme.fogA }),
        el("rect", { width: 3, height: 8, fill: theme.fogB }),
      ],
    ),
  ]);
  const connectors = visible
    .filter((d) => d.kind === "domain" && d.anchor)
    .map((d) => {
      const anchor = regionDef(d.anchor ?? "village");
      return el("line", {
        x1: d.x,
        y1: d.y,
        x2: anchor.x,
        y2: anchor.y,
        stroke: theme.lineSubtle,
        "stroke-width": 2,
        "stroke-dasharray": "4 4",
      });
    });
  const stars =
    theme.id === "dark"
      ? [
          el(
            "g",
            { "aria-hidden": "true", fill: theme.textTertiary, opacity: 0.55 },
            STARS.map(([cx, cy, r]) => el("circle", { cx, cy, r })),
          ),
        ]
      : [];

  const body: SvgNode[] = [
    el("title", { id: "t" }, [text(mapTitle(state))]),
    el("desc", { id: "d" }, [text(mapDescription(state))]),
    defs,
    el("rect", {
      x: 1,
      y: 1,
      width: CANVAS.width - 2,
      height: CANVAS.height - 2,
      rx: 16,
      fill: "url(#sky)",
      stroke: theme.gold,
      "stroke-opacity": 0.4,
    }),
    ...stars,
    ...titleBand(state, theme, boxes),
    el("g", { id: "road" }, road(state, theme)),
    el("g", { id: "connectors" }, connectors),
    ...visible
      .filter((d) => d.kind === "domain")
      .map((d) => plaque(d, byId.get(d.id) as RegionStateValue, theme)),
    ...visible
      .filter((d) => d.kind === "main")
      .map((d) => plaque(d, byId.get(d.id) as RegionStateValue, theme)),
    ...currentMarkers(state, theme, boxes),
    ...progressBand(state, theme, boxes),
    ...legend(theme, boxes),
  ];
  for (const def of visible)
    if (byId.get(def.id)?.state === "completed") {
      const b = plaqueBox(def);
      boxes.push({
        kind: "pennant",
        id: def.id,
        owner: def.id,
        x: b.x + b.width - 20,
        y: b.y - 14,
        width: 16,
        height: 16,
      });
    }
  const root = el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: CANVAS.width,
      height: CANVAS.height,
      viewBox: `0 0 ${CANVAS.width} ${CANVAS.height}`,
      role: "img",
      "aria-labelledby": "t d",
      "font-family": FONT_STACK,
    },
    body,
  );
  return { svg: `${serialize(root)}\n`, boxes };
}
