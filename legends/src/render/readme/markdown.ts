/**
 * Safe Markdown/HTML builder for the README block (ADR-0010). Untrusted strings can only
 * enter through an escaping function; already-safe fragments carry the `SafeMd` brand.
 *
 *   md`**${name}** reached level ${level}`   // name escaped, number formatted
 *   link("profile", githubUrl(login))        // URL restricted to github.com or repo paths
 *
 * There is no way to insert a raw string other than `trusted()`, which is used only for
 * literals written in this codebase.
 */
import { escapeAttr } from "../svg.ts";
import { formatCount } from "../text.ts";

declare const SAFE: unique symbol;
export type SafeMd = string & { readonly [SAFE]: true };

/**
 * Strings produced by this module. A value is inserted unescaped only if these exact bytes
 * were produced here, so an equal untrusted string is equally safe.
 */
const SAFE_VALUES = new Set<string>();
const brand = (s: string): SafeMd => {
  SAFE_VALUES.add(s);
  return s as SafeMd;
};

/** A literal written in this codebase (never data). */
export function trusted(literal: string): SafeMd {
  return brand(literal);
}

/** Markdown inline text: HTML-escaped and Markdown-escaped, single line. */
export function escapeInline(value: string): SafeMd {
  return brand(
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Brackets are escaped, so parentheses can never form a link and stay readable.
      .replace(/([\\`*_[\]#!|~])/g, "\\$1")
      .replace(/\r?\n|\r/g, " "),
  );
}

export function isSafe(value: unknown): value is SafeMd {
  return typeof value === "string" && SAFE_VALUES.has(value);
}

type Interp = SafeMd | string | number | null | undefined;

/** Tagged template: strings are escaped, numbers formatted, SafeMd inserted as is. */
export function md(strings: TemplateStringsArray, ...values: Interp[]): SafeMd {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    out += render(v) + (strings[i + 1] ?? "");
  });
  return remember(out);
}

function render(v: Interp): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return formatCount(v);
  if (SAFE_VALUES.has(v)) return v;
  return escapeInline(v);
}

const remember = brand;

export function join(
  parts: ReadonlyArray<SafeMd | null | undefined | false>,
  separator = "\n",
): SafeMd {
  return remember(parts.filter((p): p is SafeMd => typeof p === "string").join(separator));
}

// ------------------------------------------------------------------ URLs

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}\/[A-Za-z0-9._-]{1,100}$/;
const RELATIVE = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*\.(?:md|svg)(?:#[a-z0-9-]+)?$/;

export class UnsafeUrlError extends Error {}

export type SafeUrl = string & { readonly [SAFE]: "url" };

export function githubProfileUrl(login: string): SafeUrl {
  if (!LOGIN.test(login)) throw new UnsafeUrlError("invalid GitHub login");
  return `https://github.com/${login}` as SafeUrl;
}

export function githubRepoUrl(fullName: string): SafeUrl {
  if (!REPO.test(fullName) || fullName.split("/")[1]?.startsWith("."))
    throw new UnsafeUrlError("invalid repository name");
  return `https://github.com/${fullName}` as SafeUrl;
}

/** A path inside this repository (docs pages and generated assets): no scheme, no "..". */
export function repoPath(path: string): SafeUrl {
  if (!RELATIVE.test(path) || path.includes(".."))
    throw new UnsafeUrlError("invalid repository path");
  return path as SafeUrl;
}

export function link(text: SafeMd | string, url: SafeUrl): SafeMd {
  return md`[${text}](${trusted(url)})`;
}

// ------------------------------------------------------------------ HTML blocks GitHub keeps

/** `<picture>` with dark default and light variant; optional link around it (readme-layout §3). */
export function picture(options: {
  dark: SafeUrl;
  light: SafeUrl;
  alt: string;
  width: number;
  href?: SafeUrl;
}): SafeMd {
  if (!Number.isInteger(options.width) || options.width <= 0 || options.width > 900)
    throw new UnsafeUrlError("invalid width");
  const img =
    `<picture>` +
    `<source media="(prefers-color-scheme: dark)" srcset="${escapeAttr(options.dark)}">` +
    `<source media="(prefers-color-scheme: light)" srcset="${escapeAttr(options.light)}">` +
    `<img src="${escapeAttr(options.dark)}" width="${options.width}" alt="${escapeAttr(options.alt)}">` +
    `</picture>`;
  return remember(options.href ? `<a href="${escapeAttr(options.href)}">${img}</a>` : img);
}

/** `<details>` with blank lines so Markdown renders inside (readme-layout §3). */
export function details(summary: SafeMd, body: SafeMd): SafeMd {
  return remember(`<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`);
}

export function centered(inner: SafeMd): SafeMd {
  return remember(`<p align="center">\n  ${inner}\n</p>`);
}

/** A Markdown table (≤ 3 columns for phones, readme-layout §4). Cells are escaped. */
export function table(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<SafeMd | string | number>>,
): SafeMd {
  if (headers.length > 3) throw new Error("tables are limited to 3 columns");
  const cell = (c: SafeMd | string | number) => render(c).replace(/\n/g, " ");
  return remember(
    [
      `| ${headers.map((h) => escapeInline(h)).join(" | ")} |`,
      `| ${headers.map(() => "---").join(" | ")} |`,
      ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
    ].join("\n"),
  );
}

/** Ten-cell text bar, e.g. "▰▰▰▰▰▰▱▱▱▱ 62%". Percent is clamped to 0–100. */
export function textBar(percent: number): SafeMd {
  const p = Math.max(0, Math.min(100, Math.floor(percent)));
  const filled = Math.round(p / 10);
  return remember(`${"▰".repeat(filled)}${"▱".repeat(10 - filled)} ${p}%`);
}

/** HTML comment marking a section, used by the validator (invisible on GitHub). */
export function sectionMarker(id: string): SafeMd {
  if (!/^[a-z-]{1,24}$/.test(id)) throw new Error("invalid section id");
  return remember(`<!-- legends:section:${id} -->`);
}
