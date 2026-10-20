# GitHub Legends — World Map Renderer

- **Phase:** 09 (implementation) · **Date:** 2026-10-20
- **Code:** `legends/src/render/`
  - Shared: `svg.ts` (typed builder), `tokens.ts`, `text.ts` (fitting and sanitising), `validate.ts` (post-render validator)
  - Map: `legends/src/render/map/` — `catalog.ts`, `schema.ts`, `state.ts`, `glyphs.ts`, `checkpoint.ts`, `rank.ts`, `render.ts`, `text.ts`
- **Tests:** `legends/test/render/svg.test.ts`, `legends/test/render/map.test.ts`, `legends/test/core/source-hygiene.test.ts`; fixtures in `legends/test/fixtures/map-facts.ts`
- **Example output:** `legends/preview/world-map/` (SAMPLE DATA). Regenerate with `pnpm preview:map`.
- **Spec:** `docs/design/map-specification.md`, `visual-direction.md` (VD-01…VD-05), GDD §J, progression-tables §8, ADR-0010 (safe rendering), component C-50/C-51

The world is "The Realms", an original night-time fantasy realm. All region names, motifs and glyphs belong to this project; nothing is traced from or modelled on Mobile Legends map art (visual-direction §2.1).

## 1. Pipeline

```
EngineOutput ─ mapFacts() ─► MapFacts ─ mapStateFromFacts() ─► parseMapState() ─► MapState
                                                                               │
              renderMap(state, DARK | LIGHT) ──► SVG + layout boxes ──► validateSvg() + overlapIssues()
              mapDescription / mapAltText / regionList / mapEmbed ──► <desc>, <img alt>, Markdown fallback
```

- `mapFacts(output)` reads one engine run and produces plain facts: level, EXP, rank, emblem EP and levels, active quests, and evidence for each checkpoint.
- `mapStateFromFacts(facts, {name, sample, stale})` applies the map rules (§3). The result goes through `parseMapState` (zod) before it is returned.
- `renderMap` validates its input again, so unvalidated state cannot be rendered.
- Every function is pure: no clock, no randomness, no I/O.

## 2. Map data schema (`schema.ts`)

| Field | Type and constraints |
| --- | --- |
| `version` | Literal `1` |
| `sample`, `stale` | Booleans: "SAMPLE DATA" watermark, "Stale data" chip |
| `asOf` | `YYYY-MM-DD` |
| `player` | `name`: 1–256 chars and must equal its own sanitised form (§6). `initials`: sanitised, ≤ 2 graphemes. `level`: integer 1…10⁶. `exp`: integer 0…10¹² |
| `rank` | `{tier: TierId, division: 1 | 2 | 3 | null, stars}` or `null` (no season yet) |
| `current` | A main-region id |
| `next` | `{kind: "checkpoint", region, checkpoint}` · `{kind: "gate", region, level}` · `{kind: "done"}` |
| `progress` | `{kind: "level" | "checkpoints", current, target, percent: 0…100}` |
| `quests` | `{active}`: incomplete quests on today's and this week's boards |
| `regions` | Exactly 13 entries: `{id, state: hidden | locked | unlocked | current | completed, missing: "level" | "emblem" | null, checkpoints[3]: {id, status: cleared | next | open | unavailable, clearedOn}}` |

Cross-field rules:

- Region ids are unique and cover the catalog.
- Checkpoint ids appear in catalog order.
- Only domain regions can be hidden; only main regions can be current; at most one region is current.
- `missing` is set exactly for locked regions.
- A completed region has 3 cleared checkpoints.
- A `next` checkpoint appears only in the current region.
- Uncleared checkpoints carry no date.

Error messages give paths and rule names only; they never echo input values.

**Only the player name is free text.** Region names, short labels, checkpoint labels, gates and glyphs are constants in `catalog.ts`, and state refers to them by id. Repository metadata (names, topics, descriptions) never reaches the map.

## 3. Map rules (`state.ts`)

| Rule | Implementation |
| --- | --- |
| Main gates | Level 1 / 5 / 10 / 20 / 35 / 50 (GDD §J.2) |
| Domain gates | Hidden while the emblem has 0 EP. Locked until emblem level 1 (`missing: "emblem"`), then until player level 10 (`missing: "level"`). Then unlocked, or completed when L1/L4/L7 are all reached |
| Checkpoint evidence | Medals M-001, M-002, M-003, M-004, M-005, M-040 II, M-042, M-043, M-051, M-035; the first `unlock.hero`; the first weekly `quest.complete`; season states for Knight, Paragon, Eternal and the Champion trial; `emblem.level` entries for domains; ≥ 3 discovered heroes (no date) |
| Cleared before unlock | Shown as cleared once the region is drawn; listed in the text table (`Citadel of Releases | 🔒 Lv 20 | 1/3`) |
| Current region | Spec §5: the highest unlocked main region. Once all six are unlocked, the lowest unfinished one (the Throne when all are done) |
| Next milestone | The first open, available checkpoint of the current region. Otherwise the next region's gate, or "All regions cleared" |
| Progress | Toward the next region: EXP between the current region's gate level and the next gate level, floored to a percent. After the last gate: cleared / available main-path checkpoints |
| Permanence | Levels, emblem levels, medals and tier records never decrease, so regions never re-lock and checkpoints never un-clear (tested across runs) |

## 4. Rendering (`render.ts`)

**Canvas:** `viewBox 0 0 420 820`, portrait, fixed slots from spec §2.1.

| Band | Contents |
| --- | --- |
| Title (y 0–56) | "THE REALMS"; SAMPLE DATA watermark and Stale data chip on the right; player name on the left (15 px bold, truncated); **rank marker** on the right |
| Map field (y 56–750) | Starry sky (dark theme only), main road, domain connectors, region plaques, current-region markers |
| Progress and legend (y 750–820) | "Next region: …", "Lv 14 / 20 · 45%" and a progress bar; legend for Cleared, Open, Rank, Quest, Domain, Locked; caption "Pin = you are here. Full region list below the map." |

**Components:**

- **Main road:** a cubic Bézier through M1→M6. The 10 px `line.subtle` base, a 4 px gold travelled section up to the current region, and a 2 px dotted upcoming section.
- **Region plaques** (main 170×56, domain 128×48):
  - unlocked: solid `bg.raised` with a gold (main) or teal (domain) rim;
  - locked: hatched fog pattern, dashed rim, lock glyph and gate ("Unlocks at Lv 20", "DevOps L1", or "Lv 10" on narrow domain plaques);
  - completed: 2 px rim, highlighted name and a pennant;
  - hidden: not drawn, and no connector.
- **Distinct region treatments:** each region has its own code-drawn motif (hut, forked tree, wave with an eye, tower, twin peaks, throne; spire, anvil, arches, telescope, anchor, vault, gate) in the row next to its checkpoints. The rim colour separates the main path (gold) from domains (teal).
- **Checkpoint renderer** (`checkpoint.ts`):
  - shape encodes the kind: standard = circle, **rank = shield**, **quest = diamond**;
  - fill and stroke encode the status: cleared = filled with a check, next = thick gold ring, open = thin grey ring, unavailable = dotted ring;
  - state never relies on colour alone (WCAG 1.4.1).
- **Current region:**
  - a soft outer ring;
  - a gold pin with the player's initials on the plaque's left edge (one initial when two do not fit, for example CJK);
  - the **Next chip** above or below the plaque, a fixed side per slot so it never covers another plaque;
  - the **quest marker** (scroll glyph and count of active quests, "99+" above 99) next to the chip.
- **Rank marker** (`rank.ts`): the rank label ("Champion II", or "Eternal 12.3K" with a drawn star for undivided tiers), "· Lv N", and a heraldic shield in the tier colour (visual-direction §3.3). The pieces are right-anchored, so only short strings are positioned by estimate. The rank label gets up to 250 px; the player name takes the rest.

**Themes:** dark (default, VD-01: deep navy `#0B1020`/`#131B30`/`#1B2542`, gold `#E0B54E`/`#F3D98E`, teal `#4FD1C5`) and light parchment (VD-02), both from `tokens.ts`. Every SVG ships in both themes for `<picture>`. No filters, no animation, no embedded fonts (VD-03, visual-direction §7).

**Responsive behaviour:**

- The README shows the image at `width="420"`; GitHub scales it down on narrower columns (about 0.86× on a 360 px phone column). Essential text is at least 11 px at natural size.
- **Long names:** player names are truncated with "…" at grapheme boundaries. Region names try 14→13→12 px (domain 12→11), then the short label, then truncation.
- **Large values:** `formatCount` gives 9,999 · 12.3K · 987.6M · 1.2B, floored so values are never overstated. Quest counts above 99 show "99+".
- **Text measurement** (`text.ts`): a conservative width table (the widest of Segoe UI, SF and Helvetica, plus 8%), with full width assumed for CJK and unknown glyphs.

## 5. Text alternatives (fallback)

- SVG `<title>` ("World map: The Realms", plus "(sample data)") and `<desc>`. The `<desc>` gives player, rank, current region, next milestone, progress and every visible region's state. Hidden regions are not mentioned.
- `<img alt>`: the same text cut at a word boundary to ≤ 600 characters, ending "Full region list below."
- `regionList`: the Markdown region table (C-51) with status, progress and "not available yet" notes. It always follows the image, so screen readers, image-blocked clients and very small screens get every fact.
- `mapEmbed`: the README block (`<details>`, `<picture>` with a light `<source>`, `<img width="420" alt>`, then the list). Asset paths must be relative `.svg` paths (`validateAssetPath`): no scheme, no `..`, no query, no absolute path.

## 6. Security

- **Builder** (`svg.ts`):
  - element and per-element attribute allow-lists (no `script`, `foreignObject`, `use`, `image`, `a`, `style`, `href` or event handlers);
  - text and attribute escaping at serialisation;
  - non-finite numbers rejected;
  - path data and transforms built from numbers and literal commands only.
- **Untrusted text** (`sanitizeLabel`):
  - NFC normalisation;
  - line breaks become spaces;
  - control, format (including bidirectional overrides and zero-width characters), private-use and surrogate code points are removed;
  - whitespace collapses; at most 64 graphemes.
  - `stripPictographs` removes emoji, which may not appear inside SVGs (visual-direction §5).
- **Validator** (`validate.ts`): a strict parser that is independent of the builder (no comments, DTD, PIs or CDATA; double-quoted attributes; known entities only). It rejects:
  - unknown elements and attributes, and event handlers;
  - `url()` other than `url(#id)`, and dangling references;
  - colours that are not tokens of the rendered theme;
  - malformed transforms, path data or points;
  - unsafe characters, empty text, text below 10 px, text outside the canvas;
  - missing `<title>`/`<desc>`, broken `aria-labelledby`;
  - files over the size budget (100 KB).
- **Overlap lint** (`overlapIssues`): rejects overlapping layout boxes and plaques closer than 16 px. Markers may touch only their own plaque.
- **Source hygiene:** a test rejects invisible or bidirectional control characters in `src`, `test` and `scripts` ("Trojan Source"). Such characters must be written as `\u` escapes. Fixing this changed one existing file: `src/core/log.ts` now writes U+200B as an escape, with no change in behaviour.

## 7. Determinism

- Canonical serialisation: sorted attributes, at most 2 decimals, no "-0", no whitespace between nodes.
- Fixed slots and a constant star field.
- Identical state gives byte-identical SVG (tested).
- A golden test keeps `preview/world-map/mid-journey.{dark,light}.svg` in sync with the renderer.

## 8. Verification performed

**Structural (automated):**

- All 10 preview SVGs (5 scenarios × 2 themes) pass `validateSvg` and the overlap lint (`preview/world-map/validation.md`, 9.7–29.5 KB each).
- The tests render every fixture in both themes, plus every main region as current with all domains visible, 128 active quests, a 95-character name, and stale plus sample flags. They also parse each output with `xmllint --noout` when it is installed (it is in this environment).

**Visual (inspected, not assumed):**

- Headless Chromium 141 (Linux, its default sans-serif font) rendered the maps. I viewed them at 420 px (desktop column), at 360 px (phone column), and in both themes.
- Scenarios: new player, mid-journey, Throne current (CJK name, light theme), legend with everything cleared (long name, huge values, stale), and a map built from a real engine run.
- Committed screenshots are in `preview/world-map/screenshots/`.

Defects found **only by looking at the render**, all fixed:

| Defect | Fix |
| --- | --- |
| Quest marker covered the "2/3" count | Moved beside the Next chip |
| Wide gap between rank shield and label (width estimate) | Right-anchored layout, shield at the end |
| Domain names "Open Commons" fell back to short labels | 12 → 11 px step, narrower padding |
| Domain lock lines truncated ("Unlocks at Lv…") | "Lv 10" on domain plaques |
| Next chip truncated | Compact gate text ("Citadel of Releases at Lv 20") |
| CJK initials overflowed the pin | Fall back to one initial |
| Emoji rendered in colour inside the SVG | Pictographs stripped from names |
| "·" measured as full width | Latin punctuation width class |

Two defects were found by the automated checks, not by eye:

- The lint caught the Next chip colliding with the Throne's pennant when the Throne is complete and current.
- A test caught newlines being deleted instead of becoming spaces in names.

**Not verified:**

- Rendering on GitHub itself: the camo image proxy, `<picture>` theme switching, and the GitHub mobile app (architecture blocker B-04).
- System fonts on macOS, Windows, iOS and Android. The conservative width table is meant to absorb font differences, but it has only been checked against Chromium on Linux.

## 9. Interpretations and differences from the approved spec

| # | Topic | Status |
| --- | --- | --- |
| MR-1 | **Rank indicators, quest markers and the progress bar** are additions requested in this phase; the map spec does not place them. They go in the title band (rank), beside the Next chip (quests) and in the legend band (progress). Rank checkpoints are shields and quest checkpoints diamonds | New, consistent with the spec's layout bands |
| MR-2 | "First verified ally" (River of Reviews) cannot be cleared until the squad system exists. It is drawn as unavailable (dotted) and **does not hold the marker back** once all regions are unlocked; under the literal §5 rule, the marker would stay at River forever | Deviation, recorded |
| MR-3 | Spec §5 taken literally: with all six regions unlocked, the marker goes to the **lowest** unfinished region. For example, level 50 with Starter Village incomplete puts it at the Village. Spec §5 and GDD §J.3 ("furthest unlocked region") disagree here; the more concrete spec rule is used | Open for owner review |
| MR-4 | Region unlocks are **derived, not written to the ledger.** The +50 BP region-unlock reward (GDD §J.3, progression-tables §8) and the Explorer, Pathfinder and Cartographer medals (M-090…M-092) still need engine work. Unlocks are still permanent, because every gate input is monotonic | Pending (engine) |
| MR-5 | The Next chip goes **above** Forest of Branches and Throne of Eternity (below elsewhere), because below them it would hit Lantern Spires or Vault of Records | Layout fix |
| MR-6 | The region list has no links: region pages (`docs/legends/map/<region>.md`, C-52) are not generated yet | Pending (pages) |
| MR-7 | Initials instead of the avatar crop (spec: avatar is P2). No glow animation | As specified for v1 |
| MR-8 | Short labels: Observatory, Harbor (and Village, Forest, … as fallbacks). Domain lock lines show "Lv 10" instead of "Unlocks at Lv 10" | Space constraint |
| MR-9 | "Data unavailable → render the last successful map" belongs to the pipeline (it keeps the previous files). The renderer only draws the Stale data chip when `stale` is set | Division of work |
| MR-10 | The map is not yet wired into a README or CLI (the README renderer and publish step are later phases). `mapEmbed` produces the block | Pending |

## 10. Tests (47)

- **`svg.test.ts` (16):**
  - escaping, the allow-lists, non-finite numbers, canonical serialisation;
  - width measurement, ellipsis truncation, grapheme safety (ZWJ emoji, combining marks, CJK), label fitting;
  - sanitising (bidi, zero-width, newlines, length), emoji stripping, initials, compact numbers;
  - theme tokens;
  - validator: malformed XML, scripts, `foreignObject`, event handlers, `style`, external `url()`, dangling references, off-token colours, bad transforms and path data, bidi characters in text, text bounds, font size, missing `<desc>`, size budget;
  - overlap lint.
- **`map.test.ts` (30):**
  - catalog gates, slots and motif coverage;
  - schema acceptance and 10 rejection cases; no value echo in errors;
  - new-player state; every main gate; domain hidden/emblem/level gates; cleared-before-unlock; next gate when only an unavailable checkpoint is left; no stuck marker; progress maths; name sanitising;
  - state from a real engine run (earned-on dates, rank); never un-clears across runs;
  - determinism; validator and lint for all fixtures in both themes; every main region as current with every domain visible; hostile name; long names and large values; region-state drawing; quest marker and sample/stale flags; rank text; unvalidated state refused; `xmllint`;
  - text fallback: alt length, region list, Markdown escaping, embed with asset-path validation;
  - golden preview.
- **`source-hygiene.test.ts` (1):** no invisible or bidirectional characters in sources.

Full suite: **334 tests passing**. `pnpm check` (typecheck + Biome + Vitest) is clean.
