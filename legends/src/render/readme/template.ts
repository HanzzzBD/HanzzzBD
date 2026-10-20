/**
 * README block template (legends/templates/readme-block.md). The template is a plain
 * Markdown file with a closed set of placeholders; there is no logic, no expressions and no
 * way to emit raw data:
 *
 *   {{section:<id>}}    the section's text (with its validator marker)
 *   {{cards:<id>,<id>}} one centred row with the cards of those sections
 *   {{value:<key>}}     a single escaped value (login, name, level, rank, bp, season, updated)
 *   {{banner}}          sample / stale notices
 *   {{footer}}          provenance legend, how-it-works link, update time
 *
 * Unknown placeholders, stray braces and missing sections are errors, so a typo can never
 * silently drop content or leak template syntax into the profile.
 */

import { rankText } from "../map/rank.ts";
import { formatCount } from "../text.ts";
import { centered, join, md, type SafeMd } from "./markdown.ts";
import { type ProfileModel, SECTION_IDS, type SectionId } from "./model.ts";
import type { SectionOutput } from "./sections.ts";

export class TemplateError extends Error {}

const PLACEHOLDER = /\{\{\s*([a-z]+)(?::([a-z0-9,.-]+))?\s*\}\}/g;
const VALUE_KEYS = ["login", "name", "level", "rank", "bp", "season", "updated"] as const;
type ValueKey = (typeof VALUE_KEYS)[number];
const CARD_SECTIONS: readonly SectionId[] = ["lobby", "heroes", "medals"];

export interface ParsedTemplate {
  source: string;
  sections: SectionId[];
}

const isSection = (v: string): v is SectionId => (SECTION_IDS as readonly string[]).includes(v);

/** Checks placeholder syntax and that every enabled section appears exactly once. */
export function parseTemplate(source: string, enabled: ReadonlySet<SectionId>): ParsedTemplate {
  const sections: SectionId[] = [];
  for (const match of source.matchAll(PLACEHOLDER)) {
    const [, kind, arg] = match;
    if (kind === "section") {
      if (!arg || !isSection(arg))
        throw new TemplateError(`unknown section placeholder: ${match[0]}`);
      if (sections.includes(arg)) throw new TemplateError(`section "${arg}" appears twice`);
      sections.push(arg);
    } else if (kind === "cards") {
      for (const id of (arg ?? "").split(","))
        if (!isSection(id) || !CARD_SECTIONS.includes(id))
          throw new TemplateError(`"${id}" has no cards (use ${CARD_SECTIONS.join(", ")})`);
    } else if (kind === "value") {
      if (!arg || !(VALUE_KEYS as readonly string[]).includes(arg))
        throw new TemplateError(`unknown value placeholder: ${match[0]}`);
    } else if (kind !== "banner" && kind !== "footer")
      throw new TemplateError(`unknown placeholder: ${match[0]}`);
  }
  const rest = source.replace(PLACEHOLDER, "");
  if (rest.includes("{{") || rest.includes("}}"))
    throw new TemplateError("malformed placeholder (stray braces)");
  if (/<!--\s*LEGENDS:(START|END)\s*-->/.test(source))
    throw new TemplateError("the template must not contain the README markers");
  for (const id of enabled)
    if (!sections.includes(id))
      throw new TemplateError(`enabled section "${id}" is missing from the template`);
  return { source, sections };
}

function value(key: ValueKey, m: ProfileModel): SafeMd {
  switch (key) {
    case "login":
      return md`${m.player.login}`;
    case "name":
      return md`${m.player.name}`;
    case "level":
      return md`${m.player.level}`;
    case "rank":
      return md`${m.rank ? rankText({ tier: m.rank.rank.tier, division: m.rank.rank.division, stars: m.rank.rank.starsInDivision }).label : "Unranked"}`;
    case "bp":
      return md`${formatCount(m.player.bp)}`;
    case "season":
      return md`${m.season ? `Season ${m.season.id.slice(1)}` : "Off-season"}`;
    default:
      return md`${m.updatedLabel}`;
  }
}

export interface TemplateParts {
  model: ProfileModel;
  sections: ReadonlyMap<SectionId, SectionOutput>;
  banner: SafeMd;
  footer: SafeMd;
}

/** Replaces placeholders with pre-rendered safe fragments; disabled sections render empty. */
export function renderTemplate(template: ParsedTemplate, parts: TemplateParts): string {
  const out = template.source.replace(
    PLACEHOLDER,
    (_all, kind: string, arg: string | undefined) => {
      if (kind === "section") return parts.sections.get(arg as SectionId)?.text ?? "";
      if (kind === "cards") {
        const cards = (arg ?? "")
          .split(",")
          .flatMap((id) => parts.sections.get(id as SectionId)?.cards ?? []);
        return cards.length > 0 ? centered(join(cards, "\n  ")) : "";
      }
      if (kind === "value") return value(arg as ValueKey, parts.model);
      if (kind === "banner") return parts.banner;
      return parts.footer;
    },
  );
  // Disabled sections leave blank runs behind: collapse them so Markdown stays tidy.
  return `${out.replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
