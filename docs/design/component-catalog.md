# GitHub Legends — Component Catalog

- **Version:** 0.1 · **Date:** 2026-10-20
- Tokens and styles: `visual-direction.md`. Placement: `readme-layout.md`. Map details: `map-specification.md`.
- **Format key:** `SVG` = generated image (dark and light variants via `<picture>`); `MD` = generated Markdown; `HTML` = GitHub-allowed HTML (`<picture>`, `<details>`, `<a>`, `<img>`, `<p align>`, `<sub>`).
- **Every SVG component:** `role="img"`, `<title>` + `<desc>` with the full text alternative, and the same text as the `<img alt>`; no scripts, external references or filters; deterministic output; essential text ≥ 11 px.
- **Priority:** P0 = MVP; P1 = post-MVP (follows the feature catalog).

## 1. Foundations

| ID | Component | Format | Description | States | Priority |
| --- | --- | --- | --- | --- | --- |
| C-01 | Provenance mark | SVG glyph / MD text | ✔ Verified (teal), Σ Derived (gold), ✎ Self-declared (violet). Always next to the value it qualifies. | — | P0 |
| C-02 | Progress bar | SVG | Rounded track (`bg.raised`) + fill (gold, or the tier colour for rank); numeric label always present | empty, partial, full, blocked (hatched fill and lock tab) | P0 |
| C-03 | Star row | SVG | 3–5 stars per division; filled `goldHi`, empty `#3A4566` (dark) / `#D8CDB4` (light); count text beside it | n/m; Eternal shows "★ n" | P0 |
| C-04 | Stat tile | SVG | Overline label + value, 114 × 50 | normal, highlighted (gold rim), unavailable ("—" + "data unavailable") | P0 |
| C-05 | Chip | SVG / MD | Small labelled pill (role, rarity, tier, "trial") | default, achieved, locked | P0 |
| C-06 | Lock glyph | SVG | Drawn padlock (never emoji) + gate text | — | P0 |
| C-07 | Watermark | SVG | `SAMPLE DATA` micro caps, top right. Mandatory on any non-live render. | — | P0 |
| C-08 | Card shell | SVG | 400 × 250 (standard) or 400 × variable height; radius 14; gradient surface; 1 px rim in the context colour | — | P0 |

## 2. Lobby and profile

| ID | Component | Format | Size | Content and data | States | Alt text template | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C-10 | **Player card** | SVG | 400 × 250 | Avatar (embedded data URI) in a gold ring + frame cosmetic; display name; ✎ title; ✔ player since; level chip + EXP bar; stat tiles: Rank, BP, Streak; active emblem chip (P1). See `mockups/player-card.svg`. | normal; no avatar (initials); stale (amber rim + "stale" chip) | "{name}, {title}, level {lvl} ({exp}/{next} EXP), rank {rank}, {bp} Battle Points, {streak}-day streak, main hero {hero}." | P0 |
| C-11 | **Text summary line** | MD | one line | `**Level 13 · Paragon II · Season 1 (38 days left) · 2,340 BP** — [profile details](docs/legends/profile.md)` | — | (is text) | P0 |
| C-12 | Profile stats panel | MD table | full width | Lifetime EXP, commits, PRs, reviews, releases (✔ counts) and derived values (Σ); last transaction | — | (is text) | P0 |

## 3. Rank and season

| ID | Component | Format | Size | Content | States | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| C-20 | **Season card** | SVG | 400 × 250 | Season name + days left; rank crest (C-21); rank name in tier colour; star row; season stars; trial block (C-22); weekly stars "3/5 ★". See `mockups/season-card.svg`. | normal; trial-blocked (crest at previous tier with lock tab, banked stars shown); Eternal (star count); off-season gap (closing: "Season closing, results in ≤ 48 h") | P0 |
| C-21 | **Rank crest** | SVG symbol | 96 × 120 | Heraldic crest per tier (visual-direction §6) + division numeral | 8 tiers × 3 divisions; trial-blocked | P0 |
| C-22 | Trial block | SVG | 352 × 60 | "PROMOTION TRIAL · <tier>"; bar; "Objectives a/b · Contested c/d · Repos e/f" with ✔ when met | hidden (no gated tier ahead), active, complete | P0 |
| C-23 | Season badge row | SVG | 400 × 72 | Last 3 season badges (peak crest mini + "S<n>") | 0–3 badges | P1 |
| C-24 | Season archive header | MD | — | Final and peak rank, stars, battles, quests, BP, medals (season archive page) | — | P0 |
| C-25 | Season ladder table | MD table | — | Seasons ranked by stars; current season in bold | — | P1 |

## 4. Heroes, mastery, emblems, equipment

| ID | Component | Format | Size | Content | States | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| C-30 | **Hero lineup card** | SVG | 400 × 250 | 3 hero tiles (C-31) ordered by MP, main hero first with a gold rim and a star; caption "Mastery = verified activity volume, not assessed skill". See `mockups/hero-lineup.svg`. | 0 heroes (shows a "Discover your first hero" tile with the unlock rule); 1–2 heroes (empty slots shown as silhouettes) | P0 |
| C-31 | Hero tile | SVG | 116 × 160 | Hexagonal medallion: ring in the Linguist colour, monogram, role glyph; name; "Tech · Role"; "Tier · MP" | unlocked, main, discovered (silhouette and "?" with "Discovered" label), hidden (not rendered) | P0 |
| C-32 | Hero medallion (large) | SVG | 160 × 160 | For hero detail pages; mastery frame by tier (plain, bronze, silver, gold, prismatic, animated-optional) | 6 mastery tiers; skin variants | P0 |
| C-33 | Mastery bar | SVG | 352 × 40 | MP bar to the next tier; tier ticks | per tier; max (Exalted) | P0 |
| C-34 | Hero collection grid | MD + SVG | 4 per row (tiles as linked images) | All heroes grouped by role; discovered silhouettes; "Unknown Spirit" tiles | — | P0 |
| C-35 | Emblem chip | SVG | 120 × 28 | Emblem glyph + name + "Lv n" | none set; attuned; active | P1 |
| C-36 | Emblem panel | SVG | 400 × 300 | 7 emblems as a heptagon of nodes; EP bars; active one highlighted; "Suggested" tag | locked, owned, attuned, active | P1 |
| C-37 | Build row | SVG | 400 × 96 | 5 (+1) item slots with slot-category glyph; tier frame; Tagged dashed | empty slot (category glyph only), verified, tagged | P1 |
| C-38 | Item tile | SVG | 64 × 64 | Item icon (original glyph per tool category, not the tool's trademarked logo) + tier frame | Common to Legendary; tagged | P1 |
| C-39 | Declared kit row | MD | — | `✎ Declared kit: Unity · Blender` (greyed, after the build) | — | P1 |

Item icons use **category glyphs plus the tool name as text**, not official product logos, to avoid trademark use and to keep the art consistent.

## 5. Quests, medals, battles, squad, records

| ID | Component | Format | Content | States | Priority |
| --- | --- | --- | --- | --- | --- |
| C-40 | **Quest list (today)** | MD task list | `- [x] **First Blood**: 1/1 qualifying commit · +10 BP` per quest; heading with "as of <time> WIB". Fallback glyphs ☑ ☐ if task lists do not render in README ([verify]). | completed, in progress, expired (struck through after closure) | P0 |
| C-41 | Weekly quest list | MD task list | Same pattern; on `quests.md` and inside the README quest section as a second list (3 + specialty) | — | P0 |
| C-42 | Campaign tracker | MD | `**Featured campaign · The First Campaign** — step 2/4: Complete 5 daily quests (3/5)` | — | P0 |
| C-43 | **Medals strip card** | SVG | 400 × 250: 6 medal tiles (3 most recent + 3 rarest), total "23 / 50 medals"; rarity frames | 0 medals: "Your first medal awaits" + next easiest medal | P0 |
| C-44 | Medal tile | SVG | 72 × 88: original medal glyph, rarity frame pattern + rarity word, name | earned, locked (outline), hidden ("???" + hint) | P0 |
| C-45 | Medal gallery | MD + SVG | Grouped by family; tiles linked to the medal entry; earned-on dates | — | P0 |
| C-46 | **Battle history table** | MD table | Columns: Date · Result · Highlights (3 columns only, for mobile). Result text with a glyph: "★★ MVP", "★ Victory", "· Skirmish" | private highlights omitted | P0 |
| C-47 | Records table | MD table | Record · Value · Date | — | P1 |
| C-48 | Squad list | MD | `1. [@login](https://github.com/login) — synergy 18 · 4 reviews exchanged` (no avatars); declared members greyed with ✎ | squad disabled (section omitted); no allies ("No verified allies yet") | P1 |

## 6. Map and chrome

| ID | Component | Format | Content | Priority |
| --- | --- | --- | --- | --- |
| C-50 | **World map** | SVG | See `map-specification.md` | P1 |
| C-51 | Region text list | MD | One line per region: state, progress, gate, link | P1 |
| C-52 | Region page block | MD + SVG | Region header art (small SVG), checkpoint checklist with evidence links | P1 |
| C-60 | **Section heading** | MD | `### ⚔️ GitHub Legends` (emoji allowed in Markdown only) | P0 |
| C-61 | **Footer** | MD (`<sub>`) | Provenance legend · "How it works" link · "updated <time> WIB" · health state | P0 |
| C-62 | Stale banner | MD | `> ⚠ Data may be stale (last refresh 17 Oct 2026). The generator will retry.` (blockquote; shown only when stale) | P0 |
| C-63 | Breadcrumb + tab row | MD | `Legends › Heroes` + `[Profile](…) · [Rank](…) · …` | P0 |

## 7. Component states matrix (shared rules)

| State | Visual rule |
| --- | --- |
| Achieved / cleared | Gold (or the tier colour) fill or rim at 2 px; check glyph where meaningful |
| In progress | Partial bar with numeric label; never colour alone |
| Locked | `state.locked` outline, hatched "fog" pattern, lock glyph **and** gate text |
| Hidden | Not rendered (for example a domain region with no evidence) |
| Unavailable data | "—" + "data unavailable" caption; never a fake zero (PRD INT-5) |
| Self-declared | Violet ✎ mark; greyed or secondary styling |
| Sample | `SAMPLE DATA` watermark |

## 8. Theming implementation note (for the engineering phase)

Each SVG component is rendered twice from the same template with the `dark` and `light` token sets, then delivered as:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/legends/dark/player-card.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/legends/light/player-card.svg">
  <img src="assets/legends/dark/player-card.svg" width="400" alt="…full text alternative…">
</picture>
```
