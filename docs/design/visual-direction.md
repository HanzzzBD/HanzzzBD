# GitHub Legends — Visual Direction

- **Version:** 0.1 (Phase 03, UX and visual architecture) · **Date:** 2026-10-20
- **Inputs:** `docs/product/prd.md`, `docs/game-design/game-design-document.md`
- **Mockups:** `docs/design/mockups/` (sample data only)
- **Status:** direction approved by the owner (VD-01 to VD-04, 2026-10-20). No production UI is implemented.

## 1. Approved visual decisions

| ID | Decision | Choice (2026-10-20) |
| --- | --- | --- |
| VD-01 | Overall direction | **Dark-fantasy MOBA-inspired, as mocked up:** deep navy and charcoal surfaces, gold progression accents, original heraldic rank crests |
| VD-02 | Light mode | **Parchment light theme.** Every SVG ships a dark and a light variant, delivered through `<picture>` |
| VD-03 | Typography | **System font stack only.** No embedded or outlined fonts |
| VD-04 | README density | **Compact.** Player, season, heroes, medals and today's quests are visible; everything else sits in `<details>` |
| VD-05 | Art production | Code-generated iconographic SVG (PD-16). No raster illustration in v1 |

## 2. Mood and principles

- **Mood:** a war-table at night. Deep navy panels lit by gold, with heraldry marking status. Calm, legible and ceremonial rather than flashy.
- **Hierarchy first:** each card answers one question (Who? What rank? Which heroes? What's next?). Gold marks *progress*, never decoration on static data.
- **Honest data:** every value carries its provenance (✔ Σ ✎). Sample or placeholder data is always watermarked `SAMPLE DATA`.
- **Original:** no Mobile Legends logos, rank badges, hero art, UI frames, fonts, sound or iconography. Crest shapes come from general heraldry (shields, crowns, laurels, halos), and every glyph is drawn for this project.

### 2.1 Originality checklist (every new asset)

1. Drawn from scratch in code or by the project, with no traced or modified third-party game art.
2. Not a close silhouette of any Mobile Legends rank badge, emblem icon, hero portrait or map.
3. Names come from the GitHub Legends catalogs (GDD), not game terms (except "Battle Points", PD-01).
4. Any font, icon set or texture has a licence that allows embedding and redistribution (system fonts need no embedding).

## 3. Colour system

All colours are tokens. The generator never uses raw hex values outside the token file. Contrast was measured with the WCAG 2.1 formula against every surface the colour is used on.

### 3.1 Dark theme (default)

| Token | Hex | Use | Min. contrast on surfaces |
| --- | --- | --- | --- |
| `bg.abyss` | `#0B1020` | Card background (gradient end), map sky | — |
| `bg.surface` | `#131B30` | Card background (gradient start) | — |
| `bg.raised` | `#1B2542` | Tiles, bars, plaques | — |
| `line.subtle` | `#2A3556` | Dividers, path base, connectors | 3:1 not required (decorative) |
| `text.primary` | `#E9EDF6` | Headings, values | 12.9 |
| `text.secondary` | `#AEB8CE` | Labels, captions | 7.6 |
| `text.tertiary` | `#8792AB` | Meta, small caps labels | 4.8 |
| `accent.gold` | `#E0B54E` | Progress, cleared, BP | 7.8 |
| `accent.goldHi` | `#F3D98E` | Highlights, stars, current | 10.9 |
| `accent.teal` | `#4FD1C5` | Verified ✔, domain regions, streak | 8.1 |
| `accent.violet` | `#B9A6E8` | Self-declared ✎ | 7.0 |
| `state.locked` | `#5D6886` | **Shapes only** (lock outlines, empty checkpoints); never text | 2.7 (non-text graphics are always paired with text) |
| `state.victory` | `#52C98F` | Victory results | 7.3 |

### 3.2 Light theme (parchment, VD-02)

| Token | Hex | Min. contrast on surfaces |
| --- | --- | --- |
| `bg.abyss` → `bg.parchment` | `#F6F1E6` | — |
| `bg.surface` | `#FFFFFF` | — |
| `bg.raised` | `#EFE7D6` | — |
| `line.subtle` | `#D8CDB4` | decorative |
| `text.primary` (ink) | `#18203A` | 13.1 |
| `text.secondary` | `#44506B` | 6.6 |
| `text.tertiary` | `#566079` | 5.1 |
| `accent.gold` | `#7A5912` | 5.2 |
| `accent.goldHi` (light) | `#9C7420` as fill only; text uses `accent.gold` | — |
| `accent.teal` | `#0E6A62` | 5.2 |
| `accent.violet` | `#5B3FA8` | 6.3 |
| `state.locked` | `#6F7891` (shapes only) | 3.6 |
| `state.victory` | `#1A6E4E` | 5.0 |

### 3.3 Rank tier colours

| Tier | Dark | Light | Crest material |
| --- | --- | --- | --- |
| Initiate | `#9AA3B5` | `#5E6677` | Weathered stone |
| Squire | `#C48A55` | `#8A5A2B` | Bronze |
| Knight | `#A9BED3` | `#3F5A75` | Steel |
| Warden | `#46BE90` | `#1F7A57`* | Emerald |
| Champion | `#5C9AF5` | `#2357B8` | Sapphire |
| Paragon | `#A47CF0` | `#6A3FC2` | Amethyst |
| Ascendant | `#F08A6C` | `#A13F25` | Ember gold |
| Eternal | `#F6E3A1` | `#7D5A0C` | Radiant gold with a prismatic rim |

\* Text in light mode uses `#1A6E4E` (5.0:1). `#1F7A57` is fill-only.

### 3.4 Rarity colours (medals, items)

| Rarity | Dark | Light (text-safe) |
| --- | --- | --- |
| Common | `#A3ACBC` | `#5E6677` |
| Uncommon | `#52C98F` | `#1A6E4E` |
| Rare | `#5C9AF5` | `#2357B8` |
| Epic | `#A47CF0` | `#6A3FC2` |
| Legendary | `#EDB64E` | `#7A5912` |

Rarity is never conveyed by colour alone: tiles also carry the rarity word and a frame pattern (Common plain, Uncommon single rim, Rare double rim, Epic notched corners, Legendary crowned corners).

### 3.5 Role colours (hero glyph tint)

Mage `#B9A6E8` · Fighter `#F08A6C` · Marksman `#52C98F` · Assassin `#E57A9A` · Tank `#A9BED3` · Support `#4FD1C5`. The hero medallion ring uses the technology's **Linguist colour** (for example TypeScript `#3178C6`). The role tint is used on the role glyph only.

## 4. Typography (VD-03)

- **Stack:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` for everything. Numbers use `font-variant-numeric: tabular-nums` where supported.
- **No embedded fonts.** Text in SVGs rendered through `<img>` uses the viewer's system fonts, so metrics vary by OS. The generator therefore:
  - measures strings with a conservative width table (the widest of Segoe UI, SF and Helvetica metrics plus 8%);
  - truncates with "…" beyond the slot width;
  - never relies on exact kerning for layout.

| Style | Size (at natural width) | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| Display | 20–22 | 700 | 0.06em | Player name, rank name |
| Title | 14–15 | 700 | 0 | Tile values, region names |
| Overline | 11–12 | 700 | 0.08–0.1em, caps | Section labels ("HERO LINEUP") |
| Body | 12–13 | 400 | 0 | Descriptions, progress text |
| Meta | 11 | 400 | 0 | Captions |
| Micro | 10 | 400 | 0.15em, caps | Watermark and footnote only (non-essential) |

**Minimum essential text size:** 11 px at natural width. Cards are 400 px wide, so on a 360 px phone column they scale to about 0.9 and essential text stays at least 9.9 px rendered. Anything essential below 11 px is a lint failure.

## 5. Iconography

- **Grid:** 24 px, 2 px stroke, round joins and caps, filled variants for "achieved" states.
- **Set (v1):** role glyphs (✦ Mage, ⚔ Fighter, ➶ Marksman, ◆ Assassin, ⬢ Tank, ✚ Support), star, lock, flag, check, crest outline, BP coin (an original faceted coin with a "BP" monogram), streak flame, quest scroll, medal, map pin, ally (two shields), item slot glyphs (boots, armor, forge, relic, tome, charm), and provenance marks (✔ check-in-circle, Σ, ✎).
- **Emoji:** allowed in Markdown headings only, for scannability (for example "🗺 World map"). Never inside SVGs, where emoji fonts vary by platform. SVGs use drawn glyphs (the mockup's lock is drawn, not 🔒).

## 6. Rank crest system (original heraldry)

All crests share one construction: a **heater shield** (rank body) + **tier ornament** + **division numeral** (III, II, I), drawn at 96 × 120.

| Tier | Ornament | Notes |
| --- | --- | --- |
| Initiate | None; plain stone shield with a chip mark | Humble start |
| Squire | Single bronze rivet band | |
| Knight | Crossed blades behind the shield | |
| Warden | Laurel sprigs at the base | |
| Champion | Small swept wings at the sides | |
| Paragon | Three-point crown on top (see mockup) | |
| Ascendant | Halo ring and taller wings | |
| Eternal | Eight-point radiant star behind the shield; prismatic rim; star count instead of a numeral | |

Division numerals sit in the shield centre in `bg.abyss` (dark) or white (light). Trial-blocked state: the crest is drawn at the previous tier with a small padlock tab and a "Trial x/y" ribbon.

## 7. Shape, depth and motion

- **Radius:** cards 14, tiles 8–10, chips 6, bars fully rounded.
- **Borders:** 1 px `accent.gold` at 35–55% opacity for cards; 2 px for "achieved" states. Gold corner ticks mark the player card only (its signature).
- **Depth:** gradient surface (`surface → abyss`) and `raised` tiles. No SVG filters (blur and drop shadows), for size and render consistency.
- **Motion:** off by default (the PRD treats it as cosmetic). If enabled later, it applies only to the current map marker glow and the Exalted or Legendary frames, as a CSS animation inside the SVG with `@media (prefers-reduced-motion: reduce) { * { animation: none } }`. Never GIFs.

## 8. Asset budgets

| Asset | Budget |
| --- | --- |
| Card SVG (each theme) | ≤ 40 KB (mockups: about 3 KB) |
| World map SVG (each theme) | ≤ 100 KB (mockup: about 11 KB) |
| Hero medallion / medal tile (docs pages) | ≤ 8 KB |
| Embedded avatar (data URI, 96 × 96 JPEG/PNG) | ≤ 12 KB |
| Total generated assets | ≤ 1 MB (PRD) |
