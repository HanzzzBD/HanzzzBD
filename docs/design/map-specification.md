# GitHub Legends — World Map Specification

- **Version:** 0.1 · **Date:** 2026-10-20
- **Mechanics source:** GDD §J, progression-tables §8. **Mockup:** `mockups/world-map.svg` (sample data).
- **Priority:** P1 (feature F-801). The spec is complete now so the P0 layout reserves its place.

## 1. Concept

"The Realms": a night-time fantasy realm drawn as a **portrait, bottom-to-top journey**. The main road climbs from Starter Village at the bottom to the Throne of Eternity at the top, and seven domain regions branch off as side areas. Portrait orientation was chosen so a single image reads well on phones (§7).

## 2. Canvas and grid

| Property | Value |
| --- | --- |
| viewBox | `0 0 420 820` |
| Display width | 420 px (README `<img width="420">`), centred |
| Safe margin | 16 px |
| Title band | y 0–56 ("THE REALMS", season accent, watermark if sample) |
| Map field | y 56–750 |
| Legend band | y 750–820 |
| Main road column | x 120–300, alternating left and right |
| Domain columns | Left x 8–134, right x 286–412 |

Positions are **fixed slots** (not computed per player), so maps are deterministic and stable from run to run.

### 2.1 Slot table

| Slot | Region | Centre (x, y) | Type |
| --- | --- | --- | --- |
| M1 | Starter Village | 240, 688 | Main |
| M2 | Forest of Branches | 140, 572 | Main |
| M3 | River of Reviews | 270, 456 | Main |
| M4 | Citadel of Releases | 140, 340 | Main |
| M5 | Peaks of Mastery | 280, 226 | Main |
| M6 | Throne of Eternity | 180, 112 | Main |
| D1 | Lantern Spires (Frontend) | 70, 650 | Domain, anchored to M2 |
| D2 | Iron Forge (Backend) | 350, 600 | Domain, anchored to M2 |
| D3 | Twin Bridges (Full-stack) | 70, 436 | Domain, anchored to M3 |
| D4 | Observatory of Patterns (AI/ML) | 350, 350 | Domain, anchored to M4 |
| D5 | Harbor of Pipelines (DevOps) | 76, 250 | Domain, anchored to M5 |
| D6 | Vault of Records (Database) | 70, 184 | Domain, anchored to M6 |
| D7 | Open Commons (Open Source) | 346, 156 | Domain, anchored to M6 |

The mockup shows "Observatory" (short form) because the full name exceeds the plaque. The renderer uses the **short label** on the map and the full name in the text list (§8).

## 3. Elements

| Element | Spec |
| --- | --- |
| **Main road** | Cubic Bézier through M1 → M6. Base stroke `line.subtle` 10 px. **Travelled section** (M1 to the current region) overlaid in `accent.gold` 4 px. **Upcoming section** overlaid as a `state.locked` 2 px dotted line (2/8 dash). |
| **Main region plaque** | 170 × 56, radius 12. Name (Title 14 px bold) + 3 checkpoint nodes, or a lock line. |
| **Domain plaque** | 128 × 48, radius 10, teal rim. Short name (12 px bold) + 3 nodes, or a lock line. |
| **Connector** | Domain plaque → anchor main plaque: 2 px dashed `line.subtle`. |
| **Checkpoint node** | Circle r = 5 (cleared, filled) / r = 4.5 hollow 1.5 px (open). Main path cleared = gold; domain cleared = teal. |
| **Region-complete banner** | Small pennant at the plaque's top-right corner, gold. |
| **Player marker** | Map pin (gold) with the player's initials (or a 14 px avatar crop, P2) at the left edge of the current plaque, plus a 6 px soft outer ring around the current plaque (`goldHi` at 35% opacity). |
| **Next-milestone chip** | Below the current plaque: dark pill "Next: <checkpoint name>" (11 px). |
| **Lock line** | Drawn lock glyph + "Unlocks at Lv 20" or "<Emblem> L1" (11 px, `text.secondary`). |
| **Legend** | Cleared · Open checkpoint · Locked · Domain (11 px) + caption "Marker = current region. Text list of all regions is below the map." |

## 4. States

| State | Applies to | Visual |
| --- | --- | --- |
| **Hidden** | Domain regions with emblem EP = 0 | Not drawn (and no connector) |
| **Fogged / locked** | Main region below its level gate; domain region with EP > 0 but gate unmet | Hatched fog pattern fill, dashed `state.locked` rim, name in `text.secondary`, lock line |
| **Unlocked** | Gate met | Solid `bg.raised` fill, coloured rim (gold for main, teal for domain), checkpoint nodes |
| **Current** | The furthest unlocked main region | Unlocked + `goldHi` rim, outer glow ring, player marker, next-milestone chip |
| **Completed** | All 3 checkpoints cleared | Gold rim at 2 px, name in `goldHi`, pennant |
| **Checkpoint cleared before its region unlocked** | — | Shown as cleared once the region unlocks. Listed as "already cleared" in the text list. |

## 5. Progress logic

- **Current region** = the highest main region whose level gate is met. When all six are unlocked, current = the lowest main region that isn't completed, or M6 if all are.
- **Next milestone** = the first uncleared checkpoint in the current region, in catalog order. If the current region is complete, it is the gate of the next region ("Reach level 20").
- **Upcoming milestones** (text list, §8): the next milestone + the next 2 gates.

## 6. Upcoming milestones and completed regions in text

The map image is always followed by the region text list (C-51), which carries every fact on the map:

```markdown
**You are here: River of Reviews** (2/3) — next: *First verified ally*
**Upcoming:** Citadel of Releases at Lv 20 · Peaks of Mastery at Lv 35

| Region | Status | Progress |
| --- | --- | --- |
| [Starter Village](docs/legends/map/starter-village.md) | ✅ Completed | 3/3 |
| [Forest of Branches](docs/legends/map/forest-of-branches.md) | ✅ Completed | 3/3 |
| [River of Reviews](docs/legends/map/river-of-reviews.md) | 📍 Current | 2/3 |
| Citadel of Releases | 🔒 Lv 20 | 0/3 |
| Peaks of Mastery | 🔒 Lv 35 | 0/3 |
| Throne of Eternity | 🔒 Lv 50 | 0/3 |
| [Iron Forge](docs/legends/map/iron-forge.md) · Backend | Unlocked | 2/3 |
| … | | |
```

Hidden domain regions are omitted from the list too. Fogged ones are shown with their gate.

## 7. Mobile readability

| Rule | Value / rationale |
| --- | --- |
| Portrait canvas | 420 px wide: displayed at ≈ 0.85× on a 360 px column. No horizontal scroll, no pinch needed for labels. |
| Minimum essential text | 11 px at natural size (≈ 9.4 px rendered at 0.85×); region names 12–14 px |
| Label length | Main ≤ 20 characters, domain ≤ 16 characters at the map label slot (short names). Longer → short label + full name in the text list. |
| Node spacing | ≥ 18 px between checkpoint nodes; ≥ 16 px gaps between plaques |
| No meaning in fine detail | States use plaque fill, rim style and text, not colour alone (WCAG 1.4.1) |
| Text list always follows | Full information without the image (screen readers, image-blocked clients, tiny screens) |
| Collapsed by default | The map sits in `<details>` (VD-04), so phones don't scroll past it unless asked |
| Verified on render | Mockup rendered at a 375 px viewport: all labels legible, no overlaps (Phase 03 check) |

## 8. Text alternatives (accessibility)

- **SVG** `<title>`: "World map: The Realms". `<desc>`: generated sentence covering every region's state, progress and the next milestone (see the mockup's `<desc>`).
- **`<img alt>`**: the same text as `<desc>`, trimmed to ≤ 600 characters, ending with "Full region list below."
- **Region text list** (§6) is mandatory and is generated from the same data as the image.
- Links in the list are the navigation path: README map → `map/index.md` → `map/<region>.md`.

## 9. Region pages (L2) and navigation hierarchy

```
README <details> World map (overview SVG + region list)
  └─ docs/legends/map/index.md     full-size map (same SVG) + region table + legend
       └─ docs/legends/map/<region>.md
            ├─ region header (small SVG plaque in current state)
            ├─ checkpoints checklist: condition · status · cleared date · evidence link
            └─ "Previous region ← · → Next region" links along the main road
```

## 10. Region identities (visual motifs, code-drawn)

| Region | Motif glyph (plaque corner) | Accent |
| --- | --- | --- |
| Starter Village | Hut and lantern | gold |
| Forest of Branches | Forked tree (branch metaphor) | gold |
| River of Reviews | Wave with an eye | gold |
| Citadel of Releases | Tower with a flag | gold |
| Peaks of Mastery | Twin peaks | gold |
| Throne of Eternity | Throne with a radiant star | goldHi |
| Lantern Spires | Spire with a lantern | teal |
| Iron Forge | Anvil | teal |
| Twin Bridges | Double arch | teal |
| Observatory of Patterns | Telescope | teal |
| Harbor of Pipelines | Anchor and pipe | teal |
| Vault of Records | Vault door | teal |
| Open Commons | Open gate | teal |

Motifs are 16 px glyphs on the 24 px icon grid, scaled. They are optional in v1 if the size budget is tight.

## 11. Edge cases

| Case | Behaviour |
| --- | --- |
| New player (level 1, nothing cleared) | Starter Village current, 0/3, next "First Commit". All other main regions fogged; all domains hidden. |
| All domain regions hidden | Connectors and domain columns empty; the main road is unchanged |
| Level 100, everything cleared | Throne completed; the marker sits on the Throne; chip says "All regions cleared" |
| Data unavailable | Render the last successful map with the stale chip in the title band; never a blank map |
| Light theme | Parchment field, ink labels, gold `#7A5912` road overlay, fog pattern in `#EFE7D6` / `#E5DCC6` |

## 12. Size and validation

- ≤ 100 KB per theme (mockup ≈ 11 KB).
- Lint: no `<script>`, no `href` or `url()` to external resources, no `<foreignObject>`, no filters, every text node within the canvas, no plaque overlaps (bounding-box check over all slots).
