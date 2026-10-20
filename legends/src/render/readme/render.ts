/**
 * Profile renderer: model → README block + every SVG it references (both themes).
 * Pure; the caller writes the files and injects the block between the README markers.
 */
import { HEROES } from "../../engine/heroes/catalog.ts";
import {
  buildCard,
  emblemsCard,
  heroLineupCard,
  medalsCard,
  playerCard,
  seasonCard,
} from "../cards/cards.ts";
import { renderMap } from "../map/render.ts";
import { mapAltText } from "../map/text.ts";
import { cardPalette, THEMES, type Theme, themeColours } from "../tokens.ts";
import { overlapIssues, type SvgIssue, validateSvg } from "../validate.ts";
import { type ProfileModel, SECTION_IDS, type SectionId } from "./model.ts";
import {
  banner,
  CARD_ALTS,
  CARD_FILES,
  type CardFile,
  footer,
  renderSection,
  type SectionOutput,
} from "./sections.ts";
import { parseTemplate, renderTemplate } from "./template.ts";

export interface RenderedProfile {
  block: string;
  /** Repository-relative path → SVG content. */
  files: Map<string, string>;
}

const RENDERERS: Readonly<Record<Exclude<CardFile, "map">, (m: ProfileModel, t: Theme) => string>> =
  {
    player: playerCard,
    season: seasonCard,
    heroes: heroLineupCard,
    medals: medalsCard,
    emblems: emblemsCard,
    build: buildCard,
  };

/** Which cards each section needs (only those files are written). */
const SECTION_CARDS: Partial<Record<SectionId, CardFile[]>> = {
  lobby: ["player", "season"],
  heroes: ["heroes"],
  medals: ["medals"],
  emblems: ["emblems"],
  equipment: ["build"],
  map: ["map"],
};

export function renderProfile(
  model: ProfileModel,
  templateSource: string,
  assetBase = "assets/legends",
): RenderedProfile {
  const template = parseTemplate(templateSource, model.sections);
  const alt: Record<CardFile, string> = {
    player: CARD_ALTS.player(model),
    season: CARD_ALTS.season(model),
    heroes: CARD_ALTS.heroes(model),
    medals: CARD_ALTS.medals(model),
    emblems: CARD_ALTS.emblems(model),
    build: CARD_ALTS.build(model),
    map: mapAltText(model.map),
  };
  const sections = new Map<SectionId, SectionOutput>();
  for (const id of SECTION_IDS)
    if (model.sections.has(id)) sections.set(id, renderSection(id, { model, assetBase, alt }));
  const block = renderTemplate(template, {
    model,
    sections,
    banner: banner(model),
    footer: footer(model),
  });

  const files = new Map<string, string>();
  const needed = new Set([...model.sections].flatMap((s) => SECTION_CARDS[s] ?? []));
  for (const theme of Object.values(THEMES))
    for (const file of needed) {
      const svg = file === "map" ? renderMap(model.map, theme).svg : RENDERERS[file](model, theme);
      files.set(`${assetBase}/${theme.id}/${CARD_FILES[file]}`, svg);
    }
  return { block, files };
}

/** Validates every generated SVG (safety, palette, bounds, budget) and the map layout. */
export function validateProfileAssets(
  model: ProfileModel,
  files: ReadonlyMap<string, string>,
): Array<SvgIssue & { file: string }> {
  const issues: Array<SvgIssue & { file: string }> = [];
  const accents = HEROES.map((h) => h.accent);
  let total = 0;
  for (const [path, svg] of files) {
    total += Buffer.byteLength(svg);
    const theme = path.includes("/light/") ? THEMES.light : THEMES.dark;
    const isMap = path.endsWith(CARD_FILES.map);
    const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 0);
    const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 0);
    const found = validateSvg(svg, {
      theme,
      width,
      height,
      maxBytes: isMap ? 100_000 : 40_000,
      palette: isMap ? themeColours(theme) : cardPalette(theme, accents),
    });
    issues.push(...found.map((i) => ({ ...i, file: path })));
    if (isMap)
      issues.push(
        ...overlapIssues(renderMap(model.map, theme).boxes).map((i) => ({ ...i, file: path })),
      );
  }
  if (total > 1_000_000)
    issues.push({ code: "total_budget", detail: `${total} bytes of assets (> 1 MB)`, file: "*" });
  return issues;
}
