# GitHub Legends — Hero System (Heroes, Equipment, Presentation)

- **Phase:** 07 (implementation) · **Date:** 2026-10-20
- **Code:** `legends/src/engine/heroes/` (`catalog.ts`, `attribution.ts`, `mastery.ts`, `equipment.ts`, `presentation.ts`, `index.ts`), `legends/src/normalize/markers.ts`
- **Tests:** `legends/test/engine/heroes.test.ts`, `legends/test/engine/specialization.test.ts`
- **Spec:** GDD §C (heroes) and §E (equipment), progression-tables §4, §6, §7; design `component-catalog.md` C-30…C-39
- **Companion:** `mastery-system.md` (mastery maths and emblems)

> **Language statistics are indicators of technology usage, not proof of expertise.** No hero, tier, card or panel states that the player is proficient in a technology. Every mastery display carries the caption *"Mastery reflects verified activity volume, not assessed skill."*, and the equipment panel states that a detected tool shows it is configured in a project, not proficiency.

## 1. Hero catalog

24 original heroes, one per technology, transcribed from GDD §C.2. The test suite parses the GDD table and fails if the catalog drifts.

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier (lower-case name; never reused) |
| `name`, `epithet` | Original character name and epithet |
| `role` | `mage` · `fighter` · `marksman` · `assassin` · `tank` · `support` (GDD §C.1) |
| `technology` | Label on the card |
| `languages` | GitHub Linguist names credited to the hero, aliases included (Ledgera: SQL, PLpgSQL, TSQL, PLSQL; Prismara: ShaderLab, HLSL) |
| `description` | Original one-line flavour text. It describes the character, never the player |
| `accent` | Medallion accent: the Linguist language colour (MIT-licensed data), overridable by the renderer |
| `monogram` | Two letters drawn on the medallion (unique across the roster) |
| Icon reference | Built by the presentation layer: `{ asset: "<iconBasePath>/<id>.svg", glyph, monogram, accent }`. No image files ship; the renderer draws original code-generated SVGs (PD-16). No Mobile Legends art, names or assets are used |
| Unlock requirements | `HERO_UNLOCK` (§2) |
| Mastery rules | `MASTERY_TIERS` (see `mastery-system.md`) |

**Unknown technologies:** a Linguist language with no catalog hero becomes an **Unknown Spirit** with the stable id `unknown:<slug>` (for example `unknown:haskell`, `unknown:fsharp`). It shows verified usage but has no art, no unlock, no tiers and no BP, until a ruleset adds a hero for it.

## 2. Hero states and unlock rule (GDD §C.3)

| State | Condition | Shown |
| --- | --- | --- |
| `undiscovered` | No attributed MP | Not shown |
| `discovered` | MP > 0 | Silhouette card with the unlock rule as a hint |
| `unlocked` | MP ≥ 100 **and** at least one eligible repo with ≥ 5 qualifying player commits where the technology's current byte share is ≥ 10% | Full card |

- Unlocking writes `unlock.hero|<id>` and `bp.hero_unlock|<id>` (50 BP) once. Unlocks are **permanent** (PRD INT-4): later loss of evidence never re-locks a hero.
- Only **public, non-fork, non-excluded** repositories count (D-02). Private repositories never feed heroes.
- **Main hero** (`config.heroes.main`): must be unlocked; otherwise the unlocked hero with the most MP is used and `main_hero_not_unlocked` is reported. **Hidden heroes** (`config.heroes.hide`) are left out of the README, but their stats and unlocks are unchanged.

## 3. Equipment (GDD §E)

### 3.1 Evidence

| Evidence | Source | Result |
| --- | --- | --- |
| Marker files | `repo_markers` events: only paths matching the marker catalog are stored (`normalize/markers.ts`), never full trees or file contents | **Verified** |
| GitHub Actions | A workflow file marker **and** ≥ 1 successful push run triggered by the player (bots and schedules excluded) in that repo | **Verified** |
| Repository topics | `repo_snapshot.topics` | **Tagged** (weak) |
| `config.declaredTools` | Player declaration | **Self-declared** (✎). Never in the build, never rewarded |

- Only **eligible repos** count: public, non-fork, ≥ 5 qualifying player commits.
- Marker rules cover every item in progression-tables §7 (a test asserts the one-to-one mapping). Vendored paths (`node_modules/`, `vendor/`, `third_party/`), absolute paths and `..` segments are ignored. Laravel needs both `artisan` and `composer.json`.

### 3.2 Tiers (progression-tables §6)

| Tier | Eligible repos with verified evidence | First-time BP |
| --- | --- | --- |
| Common | 1 | — |
| Rare | 3 | 20 |
| Epic | 6 | 50 |
| Legendary | 10, and seen within the last 90 days | 100 |

Tiers are recorded as `equipment.tier|<item>|<tier>` and never go down (INT-4). Items never multiply EXP or BP (GDD §E.5).

### 3.3 Build rules

`config.build` is processed in order: unknown items (`unknown_item`), unowned items (`item_not_owned`), duplicates (ignored), a second Boots item (`second_boots`), a second tagged item (`tagged_slot_taken`) and items beyond 5 slots (`build_full`) are skipped and reported. At most one tagged item may occupy a slot; it is flagged `tagged: true` so the renderer can draw it dashed.

## 4. Presentation data (render-ready, pure)

| Function | Output | Used by |
| --- | --- | --- |
| `heroCard(state, { iconBasePath })` | `HeroCardView`: name, epithet, technology, role (id, name, glyph), state, description, icon reference, mastery `{ tier, tierName, mp, indicator { percent, current, next, label }, provenance: "derived", approximate }`, repos, lastActive, isMain (`mainProvenance: "self_declared"`), unlockHint, caption | Hero cards (C-31, C-32) |
| `heroLineup(states)` | Top 3 unlocked, visible heroes; main first | Hero lineup card (C-30) |
| `heroCollection(states)` | Cards grouped by role, Unknown Spirits, totals, caption | Hero collection page (C-34) |
| `emblemPanel(result)` | Active emblem (✎ choice + Σ level), cooldown date, all 7 emblems with EP, level, progress indicator, owned, attuned, active, suggested, EP sources | Emblem chip and panel (C-35, C-36) |
| `equipmentPanel(result)` | 5 build slots, inventory (verified and tagged, with tier, repos, last seen, evidence), declared kit, explanatory notes | Build row, item tiles, declared kit (C-37…C-39) |

All values are plain data: escaping and layout belong to the renderer (ADR-0010). Progress percentages are integers.

## 5. Engine integration

`runEngine` evaluates specialization after battles and seasons and before Battle Points, so the active emblem's bonus can apply to activity BP. Results are returned as `output.specialization = { heroes, emblems, equipment }`. New config fields (all optional, choices only): `heroes.main`, `heroes.hide`, `emblem.active`, `build`, `declaredTools`. None of them can unlock, level or verify anything (PRD INT-1).

New input guard: events whose `firstSeenAt` is later than `runAt` are rejected (`first_seen_after_run`); a real store cannot produce them.

## 6. Differences from the approved design and open items

| # | Topic | Status |
| --- | --- | --- |
| H-1 | Equipment marker evidence needs repository trees. The `repo_markers` event type and the path filter exist, but the collector does not fetch trees yet. Until then only GitHub Actions (with markers) and tags can appear, and the panel says marker data is missing | Collector work pending (one tree request per eligible repo, GDD §E.3) |
| H-2 | Expo is matched by `eas.json` only. The "`app.json` + expo folder conventions" rule is too ambiguous to verify; P2 manifest parsing (`expo` dependency) will cover it | Interpretation |
| H-3 | "A single Tagged slot" is read as: at most one tagged item may occupy one of the 5 build slots | Interpretation |
| H-4 | The 6th build slot (1,500 BP) needs the shop, which is not implemented | Pending (shop) |
| H-5 | Set medals ("Container Kit", "Quality Gate", "Full Build") and item quests need the medal and quest systems | Pending |
| H-6 | Unknown Spirits give no BP and have no tiers | Interpretation of GDD §C.5 |
| H-7 | Hero names were chosen to avoid Mobile Legends names; a legal review is still recommended before other players adopt the project (GDD §C.2) | Open recommendation |

## 7. Tests (Phase 07)

| File | Tests | Highlights |
| --- | --- | --- |
| `heroes.test.ts` | 24 | Roster parsed from the GDD; unique ids and monograms; mastery table parsed from progression-tables; aliases; Unknown Spirit ids; 99/100 MP boundary; ≥ 5 commits and ≥ 10% share; permanent unlocks; every tier boundary; tier history and BP order; multi-language split; approximate MP; Unknown Spirits; historical snapshot attribution; forks, private and missing snapshots; determinism and idempotency; cards, lineup, collection, main-hero fallback; no expertise wording |
| `specialization.test.ts` | 20 | Emblem table parsed from progression-tables; domain weights; FE/BE/Full-stack EP; game-project rule; DevOps run days (bots, schedules, failures, external repos excluded); Open Source EP; activation, free attunement and bonus; AC-SYS07-01 (13 BP); future-observed events rejected; unowned emblem, cooldown, second attunement; emblem panel; marker catalog coverage; path filtering and safety; all-of rules; equipment tiers 1/3/6/10 with BP; Legendary recency; tiers never drop; Actions needs a player run; tagged and declared evidence; build validation; missing marker data |

Full suite: **242 tests passing** (collection 75, engine 123, heroes and specialization 44). `pnpm check` (typecheck + Biome + Vitest) is clean.
