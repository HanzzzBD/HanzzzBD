# GitHub Legends — Profile README Integration

- **Phase:** 10 (implementation) · **Date:** 2026-10-20
- **Code:**
  - README: `legends/src/render/readme/` — `model.ts`, `markdown.ts`, `sections.ts`, `template.ts`, `inject.ts`, `validate.ts`, `render.ts`
  - Cards: `legends/src/render/cards/` — `shared.ts`, `crest.ts`, `cards.ts`
- **Template:** `legends/templates/readme-block.md`
- **Scripts:** `pnpm check:readme` (validate the README; part of `pnpm check`), `pnpm preview:readme` (regenerate the example)
- **Tests:** `legends/test/render/readme.test.ts` (20); fixtures in `legends/test/fixtures/profile-sample.ts`
- **Example output:** `legends/preview/readme/` (SAMPLE DATA)
- **Spec:** `docs/design/readme-layout.md`, `information-architecture.md`, `component-catalog.md`, `visual-direction.md`; PRD §6.16 (SYS-16), INT-5, INT-6; ADR-0010
- **Owner guide:** [`docs/guides/customizing-the-profile.md`](../guides/customizing-the-profile.md)

## 1. Status of the live profile

`README.md` now contains the generated-section markers, placed after the intro list and before "🌐 Connect With Me":

```html
<!-- LEGENDS:START -->
<!-- GitHub Legends block: filled by the generator after its first successful run with real data. … -->
<!-- LEGENDS:END -->
```

- **Nothing else in the README changed.** The intro, links, tech stack, the real-world "🏆 Achievements" table, the third-party stat cards (D-10) and the closing note are byte-identical, and a test asserts it.
- **The block is empty on purpose.** Real statistics need a real collection run (token, collector, state store, scheduled workflow). The command-line entry point and publish workflow are not implemented yet. Until they are, the block holds only an HTML comment, so visitors see the profile exactly as before and no statistic is invented.
- `pnpm check:readme` accepts this empty block ("pending first run"). Once the block is filled, it must contain every enabled section.

## 2. Architecture

```
EngineOutput + config + lastSuccessfulRefresh (+ calendar)
   └─ buildProfileModel()      ProfileModel: every number from the ledger or engine state
       ├─ cards (SVG, dark + light)    player · season · hero lineup · medals · emblems · build · world map
       ├─ sections (SafeMd)            15 sections, each starting with <!-- legends:section:<id> -->
       └─ template (readme-block.md)   placeholders → block
            └─ injectBlock(README)      only between the markers
                 └─ validateReadme() + validateProfileAssets()
```

All steps are pure and deterministic: the same input gives byte-identical Markdown and SVG (tested).

## 3. Sections

| # | Requested section | Section id | Format (readme-layout §2) | Source |
| --- | --- | --- | --- | --- |
| 1 | Game branding and player lobby | `lobby` | `### ⚔️ GitHub Legends` + player card and season card (`<picture>`, 400 px, wrap on phones) | Engine |
| 2 | Player statistics | `statistics` | Summary line (C-11) + collapsed table with ✔/Σ provenance | Ledger counts |
| 3 | EXP and level | `level` | Text line with a 10-cell bar, EXP into level and EXP to next | `records.lifetime` |
| 4 | Rank progression | `rank` | Text line: rank, stars to next, weekly stars, banked stars, promotion trial (+ season card) | `progress.season` |
| 5 | Current season | `season` | Text line: dates, days left, battles, victories, MVPs, past seasons | `records.current`, archives |
| 6 | Hero collection | `heroes` | Hero lineup card (top 3, main first) + count line | Specialization |
| 7 | Hero mastery | `mastery` | Collapsed table: hero, tier, MP to next tier | Specialization |
| 8 | Emblem progression | `emblems` | Collapsed: emblems card + table | Specialization |
| 9 | Equipment | `equipment` | Collapsed: build card + tool table + declared kit (✎) | Specialization |
| 10 | Quest board | `quests` | Visible task lists (today and this week), contracts, featured campaign | `quests`, `campaigns` |
| 11 | Achievements | `medals` | Medals strip card + line. Called **Medals** (game achievements) so they are never confused with the real "🏆 Achievements" table (PRD INT-6) | `medals` |
| 12 | World map | `map` | Collapsed: map SVG + region table (Phase 09) | Map state |
| 13 | Battle history | `battles` | Collapsed table of the last 10 battles (date, result and score, highlights) | Ledger |
| 14 | Squad and collaboration | `squad` | **Off unless enabled.** Collapsed list of verified collaboration counts | Objective entries |
| 15 | Repository links and developer identity | `identity` | Player profile link + most active owned public repos (by verified commit EXP) | Attribution |

The footer (C-61) carries the provenance legend, the "not assessed skill" note, a link to [`docs/legends/how-it-works.md`](../legends/how-it-works.md) and the update time in the player's timezone. Banners appear under the heading for sample data and for stale data (> 3 days since the last complete refresh, PRD §6.16).

**Order** follows the content priority in information-architecture §4: identity and rank first, the visible quest board next, detail in `<details>`. The template can reorder it.

**The developer's real identity** (name, intro, portfolio and LinkedIn links, real achievements) stays in the owner's hand-written README around the block. The block links only the GitHub profile and repositories.

## 4. Cards (supporting assets)

| File (`assets/legends/{dark,light}/`) | Component | Size | Sample size |
| --- | --- | --- | --- |
| `player-card.svg` | C-10: initials medallion, name, level and title, EXP bar, Rank / BP / Streak tiles, main hero, emblem | 400 × 250 | 2.5 KB |
| `season-card.svg` | C-20: season and days left, **rank crest** (C-21, original heraldry per tier), stars, next rank, weekly stars, trial block (C-22) or season battles | 400 × 250 | 3.5 KB |
| `hero-lineup.svg` | C-30: three hexagonal medallions in the technology colour, role marker, tier, MP bar | 400 × 250 | 4.0 KB |
| `medals-strip.svg` | C-43: three recent and three rarest medals with rarity frames, earned dates and totals; empty state "Your first medal awaits" | 400 × 250 | 6.3 KB |
| `emblems.svg` | C-36: seven emblems with level and EP bars | 400 × 260 | 3.8 KB |
| `build.svg` | C-37: five slots with slot-category glyphs and tier frames, declared kit | 400 × 166 | 3.0 KB |
| `world-map.svg` | C-50 (Phase 09) | 420 × 820 | ≈ 20 KB |

- The sample set is 14 files and about 89 KB, well inside the 40 KB per card, 100 KB per map and 1 MB total budgets.
- Cards use tokens only, plus the approved rarity, role and technology palettes (visual-direction §3.4–3.5).
- Role tints colour a small marker, never text (contrast on parchment).
- Every card has `SAMPLE DATA` and `STALE` marks when applicable, and a `<desc>` that the README reuses as `alt`.

## 5. Safe rendering

- **Typed Markdown builder** (`markdown.ts`):
  - the `md` tagged template escapes every interpolated string (HTML entities plus Markdown punctuation), formats numbers, and inserts only fragments the builder produced itself;
  - `trusted()` is used for literals in the code only.
- **URLs:** `githubProfileUrl` (validated login), `githubRepoUrl` (validated `owner/name`) and `repoPath` (relative `.md`/`.svg` paths, no `..`, scheme or query). Nothing else can become a link or image source.
- **HTML:** only what GitHub keeps — `<p align>`, `<picture>/<source>`, `<img width alt>`, `<details>/<summary>`, `<sub>`, `<b>`. No inline style, scripts, iframes or event handlers.
- **Untrusted text** (display name, repo names, unknown language names) is sanitised (control, bidi and zero-width characters removed; emoji removed in SVG) and escaped. Repository names come only from public, owned, non-fork repos and must match GitHub's name rules.
- **Template** (`template.ts`): a closed placeholder set (`section`, `cards`, `value`, `banner`, `footer`), with no logic. These are errors:
  - unknown, duplicate or missing sections;
  - stray braces;
  - markers inside the template;
  - card rows for sections without cards.
- **Injection** (`inject.ts`): exactly one START and one END marker, in order, each on its own line. Otherwise `MarkerError` and the README is not touched. Content outside the markers is preserved byte for byte.

## 6. Validation (`validate.ts`, `pnpm check:readme`)

`validateReadme(readme, {mode, requiredSections, fileExists?, previous?, maxBlockBytes?})` checks:

1. Markers: exactly one pair, ordered, on their own lines; no nested markers.
2. Pending mode: an empty block (comments only) is valid. Generated mode: the generator comment comes first, and **every required section marker appears exactly once**.
3. HTML tags and attributes against the allow-list; `<details>`, `<summary>`, `<picture>`, `<p>`, `<a>`, `<sub>` and `<b>` balanced; `media` limited to `prefers-color-scheme`.
4. Every `href`, `src`, `srcset` and Markdown link is a GitHub URL or a repository path; no `javascript:`/`data:` URL attribute; with `fileExists`, every repository path exists.
5. Every image has non-empty alt text ≤ 600 characters.
6. A blank line after `</summary>`, so Markdown renders inside `<details>`.
7. No leftover `{{…}}`; heading levels never jump; block ≤ 15 KB.
8. With `previous`: content outside the markers is unchanged.

`validateProfileAssets` runs the SVG validator on every card (allow-list, references, palette, text bounds, budget) and the map overlap lint. `pnpm check` now ends with `pnpm check:readme`, which validates the real `README.md`.

## 7. No fabricated data

- Counts come from ledger entries; level, rank, season, medals and quests from engine state.
- A value without a source is `null` and drawn as "—". The streak is unavailable unless calendar data is passed.
- Empty states say so: "no battles yet", "no hero unlocked yet", "Your first medal awaits".
- Fixture renders carry a "Sample data" banner, a `SAMPLE DATA` watermark on every card, and "(sample data)" in titles.
- Stale data is labelled: a banner, a `STALE` mark on cards, and a gold card rim.
- Tests compare the model's statistics with raw ledger counts, and render an empty player to check that nothing appears from nowhere.

## 8. Verification performed

**Structural:**

- The example README passes `validateReadme` in generated mode with all 15 sections, existing files and unchanged outside content.
- All 14 SVGs pass `validateProfileAssets`. The block is 10.4 KB.
- The live README passes in pending mode.

**Visual:** headless Chromium 141, looked at, not assumed.

- **Cards** in both themes. Defects found by eye and fixed:
  - truncated medal dates (moved to the tile corner);
  - meaningless two-letter build monograms (replaced by slot glyphs);
  - truncated and cramped emblem rows;
  - low-contrast role text on parchment (now neutral text with a tinted marker, as visual-direction §3.5 prescribes).
- **The block,** through a small *approximate* Markdown-to-HTML harness (`preview/readme/approx.html`), at a desktop width and in a 375 px phone column.
  - Desktop: cards in pairs. Phone: cards stack and scale to about 0.86×; no horizontal scroll.
  - Chromium picked the light `<source>` (it prefers the light scheme), so theme switching through `<picture>` behaves as intended there.
- The validator itself produced one false positive, fixed: a hostile display name containing "javascript:" as plain text.

**Not verified:**

- **GitHub's own rendering.** The GitHub Markdown API is not reachable from this session, which is limited to repository-scoped endpoints. The harness is not GitHub's renderer.
- GitHub's sanitiser behaviour for task lists in profile READMEs, and the README column width (readme-layout [verify] items, blocker B-04).
- The GitHub mobile app.
- The example at `legends/preview/readme/README.md` can be opened on GitHub to check these: its images and the footer link resolve relative to that folder.

## 9. Differences and open items

| # | Topic | Status |
| --- | --- | --- |
| RI-1 | The live block stays empty until the collector, CLI and scheduled publish workflow exist (architecture §12). The renderer, template, injection and validation are ready for that pipeline | Pending (pipeline) |
| RI-2 | Cards are not wrapped in links to L1 pages (`docs/legends/profile.md` and the others): those pages are not generated yet. The validator would reject links to missing files | Pending (pages) |
| RI-3 | Player card shows initials instead of the avatar (avatar collection is P2) | As specified for v1 |
| RI-4 | Squad: only verified collaboration counts. Allies need the squad system; the section says so | Partial (system missing) |
| RI-5 | Records (C-47, personal records) are not in this phase's section list and the records system does not exist | Not included |
| RI-6 | Battle highlights are counts only (no repository names or PR links) to keep private and untrusted names out; the full battle log page can add public links later | Interpretation |
| RI-7 | "Repository links" lists owned public repositories ranked by verified commit EXP (forks, private repositories and other people's repositories excluded) | Interpretation |
| RI-8 | The config schema (`ProfileConfigSchema`) is defined and validated, but nothing reads `player.config.yml` yet (loader lands with the CLI); the guide documents the keys | Pending (CLI) |
| RI-9 | Task-list checkboxes in profile READMEs are a readme-layout [verify] item; if GitHub does not render them, ☑/☐ glyphs are the documented fallback | Open (verify on GitHub) |
| RI-10 | Third-party stat cards stay outside the markers; replacing them is the owner's choice (D-10) | Owner decision |

## 10. Tests (`readme.test.ts`, 20)

- **Builder:** escaping (HTML, Markdown, pipes, links), no double escaping, URL allow-lists (javascript, data, external, `..`, absolute, query, png), picture, details, tables (≤ 3 columns), text bar clamping.
- **Template:** default sections; unknown, duplicate, missing and malformed placeholders; markers in the template; non-card rows; disabled sections and blank-line collapse; value escaping.
- **Markers:** replacement, idempotency, byte-identical outside content; missing, duplicate, reversed and inline markers; nested markers.
- **Live README:** owner sections intact, empty block valid in pending mode and invalid in generated mode.
- **Generated README:** valid with all 15 sections, files and budget. 14 tamper cases detected: script, event handler, style, javascript link, external image, empty alt, long alt, unbalanced details, missing blank line, missing or duplicate section, placeholder, iframe, heading jump. Also size budget, outside change and missing file.
- **Golden example** matches the renderer.
- **No fabrication:**
  - statistics equal ledger counts;
  - an empty player renders empty states, "—" and no sample banner;
  - stale data is labelled;
  - squad off by default; config errors rejected.
- **Assets:** validator and budgets in both themes; determinism; hostile display name escaped everywhere; alt text carries the card values.

Full suite: **354 tests passing**. `pnpm check` (typecheck, Biome, Vitest, README check) is clean.
