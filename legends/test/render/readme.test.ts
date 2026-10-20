import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { runEngine } from "../../src/engine/engine.ts";
import {
  extractBlock,
  findMarkers,
  injectBlock,
  MarkerError,
  outsideMarkers,
} from "../../src/render/readme/inject.ts";
import {
  details,
  githubProfileUrl,
  githubRepoUrl,
  link,
  md,
  picture,
  repoPath,
  table,
  textBar,
  trusted,
  UnsafeUrlError,
} from "../../src/render/readme/markdown.ts";
import {
  buildProfileModel,
  OPTIONAL_SECTIONS,
  type ProfileInput,
  SECTION_IDS,
  type SectionId,
} from "../../src/render/readme/model.ts";
import { renderProfile, validateProfileAssets } from "../../src/render/readme/render.ts";
import { parseTemplate, TemplateError } from "../../src/render/readme/template.ts";
import { validateReadme } from "../../src/render/readme/validate.ts";
import { HOSTILE_NAME } from "../fixtures/map-facts.ts";
import { SAMPLE_RUN_AT, sampleProfileInput } from "../fixtures/profile-sample.ts";
import { CONFIG, resetCounter } from "../helpers/events.ts";

const legends = fileURLToPath(new URL("../../", import.meta.url));
const repoRoot = join(legends, "..");
const TEMPLATE = readFileSync(join(legends, "templates/readme-block.md"), "utf8");
const ROOT_README = readFileSync(join(repoRoot, "README.md"), "utf8");
const ALL: readonly SectionId[] = SECTION_IDS;
const DEFAULT_REQUIRED = SECTION_IDS.filter((s) => !OPTIONAL_SECTIONS.includes(s));

const sample = buildProfileModel(sampleProfileInput());
const rendered = renderProfile(sample, TEMPLATE);
const generated = injectBlock(ROOT_README, rendered.block);
const issues = (readme: string, extra: Partial<Parameters<typeof validateReadme>[1]> = {}) =>
  validateReadme(readme, { mode: "generated", requiredSections: ALL, ...extra }).map((i) => i.code);
const tamper = (from: string, to: string) => {
  expect(generated).toContain(from);
  return generated.replace(from, to);
};

/** A player with no activity at all (fresh install). */
function emptyInput(extra: Partial<ProfileInput> = {}): ProfileInput {
  return {
    output: runEngine({
      config: CONFIG,
      events: [],
      ledger: [],
      runAt: SAMPLE_RUN_AT,
      closureAllowed: true,
    }),
    config: { login: "sample-player" },
    lastSuccessfulRefresh: SAMPLE_RUN_AT,
    ...extra,
  };
}

beforeEach(resetCounter);

describe("safe Markdown builder", () => {
  it("escapes interpolated strings and keeps safe fragments", () => {
    const evil = "<img src=x onerror=alert(1)> [click](javascript:alert(1)) **bold** | pipe";
    const out = md`Name: ${evil}`;
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).toContain("\\[click\\]");
    expect(out).toContain("\\*\\*bold\\*\\*");
    expect(out).toContain("\\| pipe");
    expect(md`a ${trusted("<b>x</b>")} b`).toBe("a <b>x</b> b");
    expect(md`${12345} BP`).toBe("12.3K BP");
    // Fragments built by the module are never escaped twice.
    expect(md`${md`${"a*b"}`}`).toBe("a\\*b");
  });

  it("restricts links and image sources to github.com and repository paths", () => {
    expect(githubProfileUrl("sample-player")).toBe("https://github.com/sample-player");
    expect(githubRepoUrl("sample-player/alpha")).toBe("https://github.com/sample-player/alpha");
    expect(repoPath("assets/legends/dark/player-card.svg")).toBe(
      "assets/legends/dark/player-card.svg",
    );
    for (const bad of [
      "javascript:alert(1)",
      "https://evil.example/x.svg",
      "../secret.md",
      "/abs/x.md",
      "x.svg?y=1",
      "data:image/svg+xml,x",
      "x.png",
    ])
      expect(() => repoPath(bad)).toThrow(UnsafeUrlError);
    for (const bad of ["-bad", "a".repeat(40), "a/b", "a b"])
      expect(() => githubProfileUrl(bad)).toThrow(UnsafeUrlError);
    for (const bad of ["a/.git", "a/b/c", "a/b c"])
      expect(() => githubRepoUrl(bad)).toThrow(UnsafeUrlError);
    expect(link("x](javascript:1)", githubProfileUrl("ok"))).toBe(
      "[x\\](javascript:1)](https://github.com/ok)",
    );
  });

  it("builds the HTML GitHub keeps: picture, details, tables", () => {
    const pic = picture({
      dark: repoPath("a/dark.svg"),
      light: repoPath("a/light.svg"),
      alt: 'say "hi" <b>',
      width: 400,
    });
    expect(pic).toBe(
      '<picture><source media="(prefers-color-scheme: dark)" srcset="a/dark.svg"><source media="(prefers-color-scheme: light)" srcset="a/light.svg"><img src="a/dark.svg" width="400" alt="say &quot;hi&quot; &lt;b&gt;"></picture>',
    );
    expect(details(md`s`, md`body`)).toBe("<details>\n<summary>s</summary>\n\nbody\n\n</details>");
    expect(() => table(["a", "b", "c", "d"], [])).toThrow();
    expect(table(["A", "B"], [["x|y", 2000]])).toBe("| A | B |\n| --- | --- |\n| x\\|y | 2,000 |");
    expect(textBar(140)).toBe("▰▰▰▰▰▰▰▰▰▰ 100%");
    expect(textBar(-5)).toBe("▱▱▱▱▱▱▱▱▱▱ 0%");
  });
});

describe("template", () => {
  const enabled = new Set(DEFAULT_REQUIRED);

  it("accepts the default template and lists its sections", () => {
    expect(parseTemplate(TEMPLATE, new Set(ALL)).sections).toEqual([
      "lobby",
      "statistics",
      "level",
      "rank",
      "season",
      "heroes",
      "medals",
      "quests",
      "map",
      "mastery",
      "emblems",
      "equipment",
      "battles",
      "squad",
      "identity",
    ]);
  });

  it("rejects unknown, duplicate, missing and malformed placeholders", () => {
    const bad: Array<[string, RegExp]> = [
      [`${TEMPLATE}{{section:shop}}`, /unknown section/],
      [`${TEMPLATE}{{section:map}}`, /appears twice/],
      [TEMPLATE.replace("{{section:quests}}", ""), /missing from the template/],
      [`${TEMPLATE}{{value:token}}`, /unknown value/],
      [`${TEMPLATE}{{eval:x}}`, /unknown placeholder/],
      [`${TEMPLATE}{{ section:map`, /stray braces/],
      [`${TEMPLATE}{{cards:quests}}`, /has no cards/],
      [`${TEMPLATE}\n<!-- LEGENDS:END -->`, /must not contain the README markers/],
    ];
    for (const [source, message] of bad)
      expect(() => parseTemplate(source, enabled)).toThrow(message);
    expect(() => parseTemplate(`${TEMPLATE}{{section:shop}}`, enabled)).toThrow(TemplateError);
    expect(() => parseTemplate(TEMPLATE.replace("{{section:squad}}", ""), enabled)).not.toThrow();
  });

  it("drops disabled sections cleanly and escapes values", () => {
    const model = buildProfileModel(
      sampleProfileInput({ config: { login: "sample-player", disable: ["battles", "map"] } }),
    );
    const { block, files } = renderProfile(
      model,
      `${TEMPLATE}\nWelcome, {{value:name}}! Rank {{value:rank}}.\n`,
    );
    expect(block).not.toContain("legends:section:battles");
    expect(block).not.toContain("legends:section:map");
    expect(block).not.toContain("legends:section:squad");
    expect(block).not.toMatch(/\n{3,}/);
    expect([...files.keys()].some((f) => f.endsWith("world-map.svg"))).toBe(false);
    expect(block).toContain("Welcome, sample-player! Rank Warden II.");
    const hostile = buildProfileModel(
      sampleProfileInput({ config: { login: "sample-player", displayName: "*x* <b>y</b>" } }),
    );
    expect(renderProfile(hostile, `${TEMPLATE}\n{{value:name}}\n`).block).toContain(
      "\\*x\\* &lt;b&gt;y&lt;/b&gt;",
    );
  });
});

describe("README markers", () => {
  const readme = "intro\n<!-- LEGENDS:START -->\nold\n<!-- LEGENDS:END -->\noutro\n";

  it("replaces only the content between the markers", () => {
    const out = injectBlock(readme, "new block");
    expect(out).toBe("intro\n<!-- LEGENDS:START -->\nnew block\n<!-- LEGENDS:END -->\noutro\n");
    expect(outsideMarkers(out)).toBe(outsideMarkers(readme));
    expect(injectBlock(out, "new block")).toBe(out);
    expect(extractBlock(out)).toBe("new block\n");
  });

  it("refuses missing, duplicated, reversed or inline markers and nested markers in the block", () => {
    for (const bad of [
      "no markers",
      `${readme}<!-- LEGENDS:START -->\n`,
      "<!-- LEGENDS:END -->\n<!-- LEGENDS:START -->\n",
      "x <!-- LEGENDS:START -->\n<!-- LEGENDS:END -->\n",
    ])
      expect(() => findMarkers(bad)).toThrow(MarkerError);
    expect(() => injectBlock(readme, "<!-- LEGENDS:END -->")).toThrow(MarkerError);
  });
});

describe("the profile README", () => {
  it("keeps the owner's content and has an empty block until real data exists", () => {
    for (const heading of [
      "# Hey, I'm Hadrian Rangga Ardiantara",
      "### 🌐 Connect With Me",
      "### 🛠️ Tech Stack",
      "### 🏆 Achievements",
      "### 📊 GitHub Stats",
      "### 💡 A Little More About Me",
    ])
      expect(ROOT_README).toContain(heading);
    expect(
      extractBlock(ROOT_README)
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim(),
    ).toBe("");
    expect(
      validateReadme(ROOT_README, { mode: "pending", requiredSections: DEFAULT_REQUIRED }),
    ).toEqual([]);
    // Not acceptable as a generated README: no sections yet.
    expect(issues(ROOT_README)).toContain("section");
  });

  it("generates a valid block with every section, within budget, outside content untouched", () => {
    expect(
      validateReadme(generated, {
        mode: "generated",
        requiredSections: ALL,
        previous: ROOT_README,
        fileExists: (p) => existsSync(join(legends, "preview/readme", p)),
      }),
    ).toEqual([]);
    expect(Buffer.byteLength(rendered.block)).toBeLessThan(15_000);
    for (const id of ALL)
      expect(rendered.block.match(new RegExp(`legends:section:${id} `, "g"))).toHaveLength(1);
    expect(outsideMarkers(generated)).toBe(outsideMarkers(ROOT_README));
  });

  it("flags unsafe or broken output", () => {
    const cases: Array<[string, string]> = [
      [
        tamper("### ⚔️ GitHub Legends", "### ⚔️ GitHub Legends\n<script>alert(1)</script>"),
        "html_tag",
      ],
      [tamper('width="400"', 'width="400" onerror="alert(1)"'), "html_attribute"],
      [tamper("<details>", '<details style="color:red">'), "html_attribute"],
      [tamper("(https://github.com/sample-player)", "(javascript:alert(1))"), "url"],
      [
        tamper('src="assets/legends/dark/player-card.svg"', 'src="https://evil.example/x.svg"'),
        "url",
      ],
      [tamper(/alt="[^"]*"/.exec(rendered.block)?.[0] ?? "", 'alt=""'), "alt"],
      [tamper(/alt="[^"]*"/.exec(rendered.block)?.[0] ?? "", `alt="${"x".repeat(601)}"`), "alt"],
      [tamper("</details>", ""), "unbalanced"],
      [tamper("</summary>\n\n", "</summary>\n"), "blank_line"],
      [tamper("<!-- legends:section:quests -->", ""), "section"],
      [
        tamper(
          "<!-- legends:section:map -->",
          "<!-- legends:section:map --><!-- legends:section:map -->",
        ),
        "section",
      ],
      [tamper("### ⚔️ GitHub Legends", "### ⚔️ GitHub Legends {{value:name}}"), "placeholder"],
      [tamper("### ⚔️ GitHub Legends", "### ⚔️ GitHub Legends\n<iframe></iframe>"), "html_tag"],
      [tamper("### ⚔️ GitHub Legends", "### ⚔️ GitHub Legends\n###### deep"), "heading_order"],
    ];
    for (const [readme, code] of cases)
      expect([code, issues(readme)]).toEqual([code, expect.arrayContaining([code])]);
    expect(issues(generated, { maxBlockBytes: 1000 })).toContain("size_budget");
    expect(
      issues(generated, { previous: ROOT_README.replace("Keep learning", "Keep yearning") }),
    ).toContain("outside_changed");
    expect(issues(generated, { fileExists: () => false })).toContain("missing_file");
  });

  it("matches the committed example (regenerate with node scripts/preview-readme.ts)", () => {
    const dir = join(legends, "preview/readme");
    expect(readFileSync(join(dir, "block.md"), "utf8")).toBe(rendered.block);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe(generated);
    for (const [path, svg] of rendered.files)
      expect([path, readFileSync(join(dir, path), "utf8") === svg]).toEqual([path, true]);
  });
});

describe("profile model: no fabricated values", () => {
  it("counts statistics straight from the ledger", () => {
    const { ledger } = sampleProfileInput().output;
    const n = (rule: string) => ledger.filter((e) => e.rule === rule).length;
    expect(sample.stats).toMatchObject({
      commits: n("exp.commit"),
      mergedPrs: n("exp.pr"),
      reviews: n("exp.review"),
      releases: n("exp.release"),
      issuesResolved: n("exp.issue_resolved"),
    });
    expect(sample.player.streak).toBe(6);
  });

  it("shows unavailable data as unavailable, and an empty player as empty", () => {
    const empty = buildProfileModel(emptyInput());
    expect(empty.player.streak).toBeNull();
    expect(empty.stats).toMatchObject({ commits: 0, mergedPrs: 0, medals: 0, heroesUnlocked: 0 });
    expect(empty.lineup).toEqual([]);
    expect(empty.battles).toEqual([]);
    const { block, files } = renderProfile(empty, TEMPLATE);
    expect(block).toContain("<b>📜 Battle history</b>: no battles yet");
    expect(block).toContain("no hero unlocked yet");
    expect(block).not.toContain("Sample data");
    expect(files.get("assets/legends/dark/player-card.svg")).toContain(">—<");
    expect(files.get("assets/legends/dark/medals-strip.svg")).toContain("Your first medal awaits");
    expect(validateProfileAssets(empty, files)).toEqual([]);
    expect(
      validateReadme(injectBlock(ROOT_README, block), {
        mode: "generated",
        requiredSections: DEFAULT_REQUIRED,
      }),
    ).toEqual([]);
  });

  it("reports stale data instead of presenting it as current", () => {
    const stale = buildProfileModel(emptyInput({ lastSuccessfulRefresh: "2026-11-10T00:00:00Z" }));
    expect(stale.stale).toBe(true);
    const { block, files } = renderProfile(stale, TEMPLATE);
    expect(block).toContain("> ⚠ Data may be stale (last complete refresh 10 Nov 2026, 07:00 WIB)");
    expect(files.get("assets/legends/dark/player-card.svg")).toContain(">STALE<");
    expect(buildProfileModel(emptyInput()).stale).toBe(false);
  });

  it("enables squad only when configured, and validates the config", () => {
    expect(buildProfileModel(emptyInput()).sections.has("squad")).toBe(false);
    expect(sample.sections.has("squad")).toBe(true);
    expect(() => buildProfileModel(emptyInput({ config: { login: "bad login" } }))).toThrow();
    expect(() =>
      buildProfileModel(emptyInput({ config: { login: "ok", unknownKey: 1 } as never })),
    ).toThrow();
    expect(() =>
      buildProfileModel(emptyInput({ config: { login: "ok", disable: ["shop"] } as never })),
    ).toThrow();
  });
});

describe("profile assets", () => {
  it("pass the SVG validator, palette and budgets in both themes", () => {
    expect(validateProfileAssets(sample, rendered.files)).toEqual([]);
    expect(rendered.files.size).toBe(14);
    for (const [path, svg] of rendered.files)
      expect([
        path,
        Buffer.byteLength(svg) < (path.endsWith("world-map.svg") ? 100_000 : 40_000),
      ]).toEqual([path, true]);
  });

  it("are deterministic", () => {
    const again = renderProfile(buildProfileModel(sampleProfileInput()), TEMPLATE);
    expect(again.block).toBe(rendered.block);
    expect([...again.files]).toEqual([...rendered.files]);
  });

  it("escape a hostile display name everywhere", () => {
    const model = buildProfileModel(
      sampleProfileInput({
        config: { login: "sample-player", displayName: HOSTILE_NAME, enable: ["squad"] },
      }),
    );
    const { block, files } = renderProfile(model, TEMPLATE);
    for (const out of [block, ...files.values()]) {
      expect(out).not.toMatch(/<script|<a href="javascript|\u202E/);
    }
    expect(validateProfileAssets(model, files)).toEqual([]);
    expect(
      validateReadme(injectBlock(ROOT_README, block), { mode: "generated", requiredSections: ALL }),
    ).toEqual([]);
  });

  it("carry every card value in the alt text", () => {
    expect(rendered.block).toContain(
      'alt="Sample Player, level 10 Journeyman, 220 of 550 EXP to level 11. Rank Warden II. 6,809 Battle Points. 6-day contribution streak.',
    );
    expect(rendered.block).toMatch(/alt="Season 1, 44 days left\. Rank Warden II\./);
  });
});
