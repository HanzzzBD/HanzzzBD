# GitHub Legends — Game Design Document

- **Version:** 0.1 (Phase 02, game design)
- **Date:** 2026-10-20
- **Inputs:** `docs/product/prd.md` and its companion docs; `docs/discovery/*`
- **Companion docs:** `progression-tables.md`, `economy-balancing.md`, `quest-catalog.md`, `achievement-catalog.md`
- **Status:** design for owner review. No engine implementation.

---

## 0. Design pillars

1. **Verified, not claimed.** Every reward traces to verified GitHub activity (PRD §3). Configuration can choose or hide; it can never add.
2. **Consistency and collaboration beat volume.** Daily caps, diminishing returns, weekly star caps and promotion trials make a steady week of real work worth more than a thousand commits.
3. **Activity is not quality.** The game measures *verified activity*. It never calls anyone a better engineer. Mastery, levels and ranks describe how much and how consistently someone worked with something, and the profile says so.
4. **MOBA-inspired, originally expressed.** Structures such as tiered ranks with stars, hero roles, emblems, six-slot builds, a weekly BP cap and seasons are inspired by Mobile Legends: Bang Bang. Names, characters, art and code are original (D-03). No Mobile Legends assets, names (except the generic phrase "Battle Points", kept by owner decision PD-01) or code are used.
5. **Readable in five seconds.** A visitor understands level, rank and main technologies without opening anything.

## 0.1 Decisions applied in this document

| Ref | Decision (2026-10-20) |
| --- | --- |
| PD-01 | The currency name stays **Battle Points (BP)** |
| PD-05 | Timezone **Asia/Jakarta (UTC+7)**; ISO weeks start Monday |
| PD-16 | Art: **code-generated, iconographic SVG** (role glyphs, frames, gradients). No illustrations in v1. |
| PD-17 | Rank protection package: promotion trials, a 5-star weekly cap, and a 3-tier soft reset |
| PD-18 | Commit EXP has diminishing returns, plus automation detection |
| PD-19 | Emblems are **seven domain emblems** levelled from verified domain evidence. They replace the PRD's activity emblems. |

## 0.2 Revisions to the PRD

This GDD supersedes PRD values where they differ. The product decision register (PD-17 to PD-19) and the acceptance criteria are updated to match.

| ID | PRD value | GDD value | Why |
| --- | --- | --- | --- |
| R-01 | Commit 10 EXP each, cap 100/day | Commits 1–5: 10 EXP; 6–10: 5 EXP; 11+: 0 (max 75/day). Automation-flagged repos earn 0. | The economy model showed volume farming, see `economy-balancing.md` §4 |
| R-02 | Self-merged, unreviewed PR 30 EXP | 15 EXP, at most 2 rewarded per day | Self-merges are scriptable |
| R-03 | MVP: score ≥ 120 and any objective | MVP: score ≥ 100 **and** ≥ 1 *contested objective* (§1.4) | Ties top results to work involving another person |
| R-04 | No weekly star limit | **5 stars per ISO week** | Rank reflects weekly consistency, not grinding |
| R-05 | Promotion on stars only | **Promotion trials** gate Champion, Paragon, Ascendant and Eternal | Scripted activity is blocked at Warden I |
| R-06 | Soft reset −2 tiers | Soft reset **−3 tiers** | Keeps Eternal rare |
| R-07 | Six activity emblems; sets bought with BP | Seven domain emblems; first attunement free, later ones 500 BP | Owner brief and decision PD-19 |
| R-08 | Medals Bronze/Silver/Gold, 25/75/200 BP | Rarity scale (Common to Legendary), 25–400 BP | Clearer collection value |
| R-09 | Equipment detection: Actions and topics (P1); files (P2) | Marker files via one recursive tree call per repo (P1); manifest parsing (P2); topics shown as "Tagged" only | The tree API is a single request per repo |
| R-10 | Daily and weekly quests | Adds milestone campaigns, collaborative quests and season contracts. New stacking rule STK-11. | Owner brief |
| R-11 | Six map regions along the main path | Main path plus **seven domain regions** tied to emblems | Connects specialisation to exploration |
| R-12 | Allies: any public interaction | Ally verification: ≥ 2 interactions in 90 days, human account ≥ 30 days old | Resists sockpuppets |

---

## 1. Core loop and shared definitions

### 1.1 Core loop

```
work on GitHub ──► nightly run collects verified events
      ▲                     │
      │                     ▼
 choose goals ◄── README shows: EXP/level, battle result, stars,
 (quests, trials,          quest progress, BP, unlocks
  emblem, build)           │
      ▲                    ▼
      └──── spend BP in shop (config purchase) ◄── BP balance
```

- **Session** = one player day (Asia/Jakarta). **Battle** = one active day. **Season** = one calendar quarter.

### 1.2 Qualifying activity (recap of PRD §4.1, with R-01 and R-02)

Only qualifying activities feed any system. A qualifying activity is: authored by the player's linked account; not by a bot; not in a fork; for commits, on the default branch, not a merge commit, not empty, not a duplicate (§1.5); and not in an automation-flagged repo (§1.6).

### 1.3 Battle score

Battle score = EXP awarded on that player day after caps, by effective date (PRD §4.4).

### 1.4 Objectives

An **objective** is a high-signal event that powers MVPs and promotion trials.

| Objective | Contested? | Condition |
| --- | --- | --- |
| Reviewed merge | ✔ | Player's PR merged, with ≥ 1 approving review from another human account |
| External merge | ✔ | Player's PR merged into a repository the player does not own |
| Peer review | ✔ | Player review (approve / request changes / comment with body) on a PR authored by another human |
| Community fix | ✔ | Issue opened by another human, closed as completed by the player in a player-owned repo |
| Release | ✖ | A qualifying release (non-draft) with ≥ 3 qualifying commits since the previous release in that repo. At most 1 per repo per 7 days and at most 2 counted per week for trials. |

**Human account** = GitHub account of type `User`, not `[bot]`, created ≥ 30 days before the event, and not the player.

### 1.5 Duplicate detection

- Each key is awarded only once (STK-1).
- **Rebase and cherry-pick duplicates:** commits in the same repo within 30 days that share a fingerprint `(normalised message, additions, deletions, changedFiles)` with an already-awarded commit are marked `duplicate` and earn 0.
- Squash merges create one default-branch commit, so they are naturally counted once (STK-2).

### 1.6 Automation detection (PD-18)

Over a rolling 30-day window, a repo is **automation-flagged** when either:

1. **Clockwork:** ≥ 10 days on which the player's commits fall within the same ±2-minute local time window, with ≥ 80% of the player's commits in the repo inside that window; or
2. **Micro-flood:** the commit EXP cap is hit on ≥ 70% of active days **and** the median commit size is ≤ 3 changed lines.

Messages matching configurable automation patterns (defaults: `[skip ci]`, `auto-update`, `chore(auto`, `Automated`, `bump version` from scripts) are counted as clockwork evidence.

Effects of a flag:

- Commits in the flagged repo earn 0 EXP and give 0 battle score while the flag holds.
- The flag is re-evaluated each run and clears automatically when the 30-day window no longer matches.
- The flag never revokes past awards.
- The player can **declare** repos as automation (`automationRepos`) to exclude them earlier. Config cannot clear a flag (INT-1).
- The run summary lists flags with the triggering rule. The README shows only "1 repository excluded as automated", with no name if the repo is private.

False-positive risk is accepted for clockwork patterns. The run summary explains the flag, and normal human patterns clear it within 30 days.

---

## A. Player progression

### A.1 Player level (lifetime)

- **Source:** lifetime EXP (ledger). It never decreases.
- **EXP to go from level n to n+1:** `100 + 50(n−1)`. **Cumulative EXP for level n:** `100(n−1) + 25(n−1)(n−2)`.
- **Cap:** level 100 (252,450 EXP). Overflow EXP is shown as `100 +x`.
- **Level titles** (default titles, unlocked automatically): 1 Rookie · 10 Journeyman · 20 Adventurer · 30 Veteran · 40 Vanguard · 50 Hero · 60 Paladin · 75 Mythsmith · 100 Living Legend.
- **Level gates** for shop tiers, map regions and weekly quests are listed in `progression-tables.md`.

Rationale: early levels come quickly (level 5 at 700 EXP, about 2–3 weeks for a new developer). Level 30 is about a year of active student work. Level 50+ represents multi-year sustained activity.

### A.2 EXP thresholds

The full table is in `progression-tables.md` §1. EXP values per activity are in `economy-balancing.md` §2.

### A.3 Rank tiers and divisions (seasonal)

| # | Tier | Divisions | Stars per division | Entry (cumulative stars) | Promotion trial to enter |
| --- | --- | --- | --- | --- | --- |
| 1 | Initiate | III, II, I | 3 | 0 | — |
| 2 | Squire | III, II, I | 3 | 9 | — |
| 3 | Knight | III, II, I | 4 | 18 | — |
| 4 | Warden | III, II, I | 4 | 30 | — |
| 5 | Champion | III, II, I | 5 | 42 | 3 objectives, ≥ 1 contested |
| 6 | Paragon | III, II, I | 5 | 57 | 8 objectives, ≥ 3 contested |
| 7 | Ascendant | — | 20 | 72 | 15 objectives, ≥ 6 contested, in ≥ 2 repos |
| 8 | Eternal | — (star count) | ∞ | 92 | 25 objectives, ≥ 10 contested, with ≥ 3 distinct human counterparts |

Trial progress counts objectives within the **current season**.

### A.4 Promotion rules

1. **Stars from battles:** Skirmish (score 1–29) gives 0; Victory (≥ 30) gives +1; MVP (≥ 100 with a contested objective) gives +2.
2. **Weekly cap:** at most **5 stars per ISO week**. Excess stars are discarded and recorded as `overflow` for records only.
3. **Immediate promotion:** division and tier update as soon as the stars reach the threshold.
4. **Trial gate:** if stars would cross into a gated tier whose trial is not complete, the rank holds at the previous tier's division I and the extra stars are **banked**. The banked stars apply the moment the trial completes (in the same or a later run within the season). The README shows "Promotion Trial: 2/3 objectives" with the banked star count.
5. **No demotion** (P-04). Stars never decrease within a season.
6. **First-time tier BP** per season: Squire 30, Knight 50, Warden 80, Champion 120, Paragon 180, Ascendant 250, Eternal 400.

### A.5 Season reset (soft reset, −3 tiers)

| Final tier | Next season starts at |
| --- | --- |
| Eternal | Champion III (42 ★) |
| Ascendant | Warden III (30 ★) |
| Paragon | Knight III (18 ★) |
| Champion | Squire III (9 ★) |
| Warden or lower | Initiate III (0 ★) |

Trial progress resets every season. Starting at Champion III does **not** require the Champion trial again; the trials apply to tiers *above* the starting tier.

### A.6 Lifetime and current-season progression

| Lifetime (never resets) | Current season (resets or archives) |
| --- | --- |
| EXP and level | Stars, rank, trial progress |
| Hero unlocks and mastery | Season EXP (display stat), battles count |
| Emblem levels | Season contracts (quests) |
| Equipment ownership and tiers | First-time tier BP eligibility |
| Medals, titles, frames, inventory, BP balance | Weekly star cap and BP cap counters (weekly) |
| Peak rank ever, season badges | Season-specific medal |
| Personal records | Season ladder entry (archived at close) |

---

## B. Virtual economy

### B.1 Currency roles

- **EXP:** long-term progression only. Never spent. Only verified activities earn it.
- **Battle Points (BP):** a reward currency. It is earned from play (battles, quests, medals, milestones, activity) and spent on things that **do not** create claims about activity or expertise.
- **Stars:** a seasonal rank currency. Not spendable. Earned only from battles.
- **Mastery Points (MP) and Emblem Points (EP):** derived meters. Not spendable.

### B.2 Reward sources (summary; full tables in `economy-balancing.md`)

| Source | BP | Limit |
| --- | --- | --- |
| Activity BP | floor(20% × EXP awarded) | Weekly cap (shared with battles) |
| Battle: Victory / MVP | 15 / 30 | Weekly cap (shared) |
| **Weekly earn cap (activity + battle)** | **700** | per ISO week |
| Daily quests | 10–25 each, 3 per day | Natural cap: board size |
| Weekly quests | 80–150 each, 3 (+1 emblem specialty) per week | Board size |
| Dedication bonus | 50 | 1 per week |
| Season contracts | 200–400 | Per season |
| Milestone campaigns | 100–500 per campaign | One-time |
| Medals | 25 / 50 / 100 / 200 / 400 by rarity | One-time |
| Level-ups | 25 per level, +100 every 10th | — |
| First-time tier per season | 30–400 | Per season |
| Season end (by peak tier) | 100–1,000 | Per season |
| Hero unlock / mastery tier | 50 / 30–500 | One-time |
| New ally (verified) | 10 | 50 per week |

### B.3 Spending and unlock mechanics

- **Channel:** config purchases (P-01, PRD §6.4). Purchases settle in file order; the balance never goes negative.
- **Shop catalog categories:**
  - Cosmetics: card frames, titles, hero skins (palette variants), map themes, badge styles.
  - **Emblem attunement:** the first emblem is free; each additional emblem costs 500 BP and needs that emblem at level ≥ 2 (verified).
  - **Sixth build slot:** 1,500 BP, once.
  - **Season Vault** items, available only during their season and gated by peak tier (for example "Season 1 Champion Frame", 2,500 BP, Champion+).
- **Never for sale:** EXP, stars, trial progress, MP, EP, hero unlocks, medals, equipment ownership.
- **Shop tiers by level:** Basic L1; Rare L5; Epic L15; Legendary L30.

### B.4 Economy balancing (summary)

The targets, simulations and sink analysis are in `economy-balancing.md`. Headline: an active student earns about **600–650 BP per week** in total and can afford one Rare cosmetic a week or one Epic item every 2–3 weeks. A Season Vault item takes about 4 weeks of saving.

### B.5 Abuse prevention (economy)

- BP is computed from the ledger. Config cannot set it.
- requestIds are idempotent.
- The weekly cap bounds the farmable sources (activity and battles).
- Quest boards are deterministic, so rerunning cannot fish for an easier board.
- BP buys no claims, so the worst case of BP farming is cosmetics.
- Automation-flagged repos give no activity BP and no battle score.

---

## C. Hero system

### C.1 Archetypes and roles

A hero is an **original character bound to one technology** (P-02). The role expresses the technology's domain.

| Role | Glyph | Domain | Fantasy |
| --- | --- | --- | --- |
| Mage | ✦ star | Frontend and UI languages | Shapes what users see; burst of visible impact |
| Fighter | ⚔ blades | Backend and application languages | Durable all-rounders holding the core lane |
| Marksman | ➶ arrow | Data, AI and scientific languages | Precision from range; insight from data |
| Assassin | ◆ diamond | Systems and performance languages | Close to the metal; precise and fast |
| Tank | ⬢ hexagon | Infrastructure and operations | Protects the team; keeps services standing |
| Support | ✚ cross | Data stores, tooling and game tech | Enables others; force multipliers |

### C.2 Hero roster v1 (original characters)

| Hero | Epithet | Technology (Linguist name) | Role |
| --- | --- | --- | --- |
| Syntaria | the Typed Arcanist | TypeScript | Mage |
| Quillon | the Script Weaver | JavaScript | Mage |
| Tessera | Keeper of Structure | HTML | Mage |
| Lumen | the Style Dancer | CSS (incl. SCSS as separate entry later) | Mage |
| Verdance | the Reactive Druid | Vue | Mage |
| Edgewright | the Template Smith | Blade | Mage |
| Orrin | the Elephant Vanguard | PHP | Fighter |
| Cerys | the Sharp Blade | C# | Fighter |
| Brannoc | the Brewmaster Knight | Java | Fighter |
| Kestrel | the Swift Runner | Go | Fighter |
| Kotra | the Island Duelist | Kotlin | Fighter |
| Pytha | the Serpent Archer | Python | Marksman |
| Orrery | the Notebook Seer | Jupyter Notebook | Marksman |
| Rowan | the Statistic Ranger | R | Marksman |
| Ferrin | the Oxide Shade | Rust | Assassin |
| Corvin | the Bare-Metal Blade | C | Assassin |
| Plexa | the Template Phantom | C++ | Assassin |
| Basalt | the Shell Bulwark | Shell | Tank |
| Hullmar | the Container Colossus | Dockerfile | Tank |
| Terrane | the Terraformer | HCL | Tank |
| Ledgera | the Query Oracle | SQL / PLpgSQL / TSQL | Support |
| Prismara | the Shader Muse | ShaderLab / HLSL | Support |
| Gloam | the Scene Bard | GDScript | Support |
| Moonquill | the Moon Scribe | Lua | Support |

The roster covers the owner's README stack (TypeScript, JavaScript, Python, PHP, C#, HTML, CSS, Shell; Unity via ShaderLab and C#; Laravel via PHP and Blade). Names were checked against the Mobile Legends hero list to avoid matches and close variants. A legal review is recommended before any public launch for adopters.

**Visuals (PD-16):** each hero renders as a code-generated emblem: role glyph, the technology's Linguist colour as the accent, the hero monogram, and a mastery frame. Skins are palette or pattern variants.

### C.3 Unlock conditions (from PRD §6.5, unchanged)

| State | Condition | Shown as |
| --- | --- | --- |
| Undiscovered | Weighted usage = 0 | Not shown |
| Discovered | Weighted usage > 0 | Silhouette and technology name |
| Unlocked | Weighted usage ≥ 100 **and** share ≥ 10% in ≥ 1 eligible repo where the player has ≥ 5 qualifying commits | Full card |

Weighted usage = Σ over eligible repos of (player commit EXP × the technology's byte share), using the language snapshot stored with each award.

### C.4 Mastery levels and progression

| Tier | MP | Visual | Reward |
| --- | --- | --- | --- |
| Novice | 100 | Plain frame | (unlock: 50 BP) |
| Adept | 1,000 | Bronze-tone frame | 30 BP |
| Veteran | 3,000 | Silver-tone frame | 60 BP |
| Expert | 8,000 | Gold-tone frame and skin variant | 120 BP |
| Virtuoso | 20,000 | Prismatic frame | 250 BP |
| Exalted | 50,000 | Animated frame (reduced-motion aware) | 500 BP |

- MP accrues from commit EXP only, split by language share. With R-01, the maximum MP from one day is 75 across all heroes.
- **Pace reference:** a student putting about 60% of 5,000 season commit EXP into TypeScript gets about 3,000 MP per season, which means Veteran in one season, Expert in about 3 seasons, and Exalted in many years.
- **The hero card shows:** role, technology, mastery tier, MP, eligible repos, and last active date. Caption: *"Mastery reflects verified activity volume, not assessed skill."*

### C.5 Technology detection limitations

| Limitation | Effect | Mitigation |
| --- | --- | --- |
| Linguist measures repository bytes, not authorship | A repo's language mix is credited to the player's commits there | Weight by the player's commit EXP and require ≥ 5 commits |
| Vendored or generated code not marked | Inflated shares | 10% share threshold; optional `excludeRepos` (reduction only) |
| Frameworks are invisible (React, Laravel, Unity) | No framework heroes | Equipment marker files (E) show frameworks as items; framework heroes are deferred |
| Markup and data formats (YAML, JSON, Markdown) are not "languages" in stats | No hero for workflow YAML | DevOps evidence comes from workflow runs and markers |
| Private repos excluded (D-02) | Heroes reflect public work only | Stated on the hero collection page |
| Mixed-purpose languages (Python, C#, TypeScript) | One language serves several domains | Heroes stay bound to the language; domain attribution happens in emblems (D) using repo context |
| Notebook output inflates Jupyter bytes | Inflated Jupyter share | Accepted; a Jupyter share weight of 0.5 can be tuned |
| Language renamed or merged in Linguist | Catalog mismatch | Catalog maps aliases; unknown languages become "Unknown Spirit" |

---

## D. Emblem system (seven domain emblems, PD-19)

### D.1 Emblems

| Emblem | Domain | Emblem Points (EP) source |
| --- | --- | --- |
| **Frontend** | UI and client | Σ commit EXP × repo FE weight |
| **Backend** | Server and application logic | Σ commit EXP × repo BE weight |
| **Full-stack** | Both ends | 2 × min(Frontend EP, Backend EP) |
| **AI/ML** | Data science and machine learning | Σ commit EXP × repo AI weight |
| **DevOps** | Infrastructure, CI/CD, operations | Σ commit EXP × repo Ops weight, + 5 EP per day with ≥ 1 successful push-triggered workflow run in an owned repo (P1 data) |
| **Database** | Schemas, queries, data stores | Σ commit EXP × repo DB weight, + 3 EP per qualifying commit touching migration or schema paths (P2, needs file paths) |
| **Open Source** | Collaboration beyond one's own repos | EXP from external merges and peer reviews in repos the player does not own, + 15 EP per issue the player opened elsewhere that was closed as completed |

### D.2 Domain weights

**Repo domain weight** = Σ over languages (byte share × language domain weight). It is snapshotted with each award. Defaults:

| Language | FE | BE | AI | Ops | DB |
| --- | --- | --- | --- | --- | --- |
| HTML, CSS, SCSS, Vue, Svelte | 1.0 | | | | |
| TypeScript, JavaScript | 0.6 | 0.4 | | | |
| Blade | 0.5 | 0.5 | | | |
| PHP, Java, Go, Kotlin, Ruby, Elixir | | 1.0 | | | |
| C# | | 1.0* | | | |
| Python | | 0.5 | 0.5 | | |
| Jupyter Notebook, R | | | 1.0 | | |
| Shell, Dockerfile, HCL, Nix, PowerShell, Makefile | | | | 1.0 | |
| SQL, PLpgSQL, PLSQL, TSQL | | | | | 1.0 |
| Rust, C, C++ | | 0.5 | | | |

\* In a repo detected as a game project (Unity or Godot marker, see E), C# and game languages contribute to **no** domain emblem. Game development is a candidate eighth emblem for later.

**Repo topic modifiers (P1):** topics such as `machine-learning`, `deep-learning` or `data-science` move Python's BE weight to AI; `frontend` or `react` move TypeScript and JavaScript to FE 1.0; `api` or `backend` move them to BE 1.0. Topics are owner-set metadata. They only **re-route** weight between domains and never add EP.

### D.3 Levels

| Level | EP | Level | EP |
| --- | --- | --- | --- |
| 1 | 100 | 6 | 5,500 |
| 2 | 400 | 7 | 8,000 |
| 3 | 1,000 | 8 | 11,000 |
| 4 | 2,000 | 9 | 15,000 |
| 5 | 3,500 | 10 | 20,000 |

Emblem level-up gives +20 BP × the new level.

### D.4 Attunement and active effect

- **Owned** = level ≥ 1 (verified evidence). **Attuned** = available to equip. The first attunement is free; each further one costs 500 BP and needs level ≥ 2.
- **One active emblem**, chosen in config. Changeable once per 7 days.
- **Active effects:**
  - **BP bonus** on matching activity BP: +15% for single-domain emblems (applied to commits in repos where the emblem's domain weight is ≥ 0.5; for Open Source, to external merges and reviews). Full-stack: +8% on all commit BP. Applied with floor rounding. Subject to the weekly cap. Never EXP (STK-8).
  - **Specialty quest:** one extra weekly quest from the emblem's pool (`quest-catalog.md` §5).
  - **Map:** the emblem's domain region shows its path highlighted (cosmetic).
- **Display:** the README card shows the active emblem as ✎ choice plus Σ level. The emblem page shows all seven with EP bars and a "Suggested" tag on the highest.

### D.5 Edge cases and abuse

- Choosing an emblem that is not attuned → the previous one stays and a warning is written.
- The Database emblem levels slowly in v1 (detection relies on SQL bytes until P2). This is documented on the page.
- EP derives only from qualifying, capped EXP or verified runs, so automation-flagged repos give 0 EP.
- Full-stack's min() formula rewards balance and cannot be raised by one-sided grinding.
- Open Source EP requires other people's repositories and is not affected by self-merges.

---

## E. Equipment system

### E.1 Concept

Development tools and infrastructure are **items**. The player's **build** is a row of up to 5 equipped items (6 with the purchased slot), inspired by six-slot MOBA builds.

### E.2 Item slots (categories)

| Slot category | Represents | Build rule |
| --- | --- | --- |
| **Boots** (movement) | CI/CD: GitHub Actions, other CI | At most 1 in the build |
| **Armor** | Runtime and infra: Docker, Compose, Nginx, Kubernetes, Terraform | — |
| **Forge** | Build and package: pnpm, npm, Yarn, Bun, Composer, pip/Poetry, Vite | — |
| **Relic** | Data: Prisma, PostgreSQL (marker), Redis (marker), migrations | — |
| **Tome** | Quality: Vitest, Jest, PHPUnit, pytest, ESLint, Prettier | — |
| **Charm** | Frameworks and engines: Laravel, Expo, Next.js, Unity, Godot, Tailwind | — |

### E.3 Obtaining items (evidence)

| Evidence | Strength | How detected | Priority | Item state |
| --- | --- | --- | --- | --- |
| Successful push-triggered workflow runs | Strong | Actions API, owned repos | P1 | Verified |
| Marker files | Strong | One recursive tree request per eligible repo, refreshed weekly with an ETag (for example `Dockerfile`, `pnpm-lock.yaml`, `artisan` + `composer.json`, `prisma/schema.prisma`, `eas.json`, `ProjectSettings/ProjectVersion.txt`, `project.godot`, `vitest.config.*`) | P1 | Verified |
| Manifest dependencies | Strong | Parse `package.json` / `composer.json` / `pyproject.toml` (1 extra request each) | P2 | Verified |
| Repository topics | Weak | Repo metadata | P1 | **Tagged** |
| Config declaration | None | Player config `declaredTools` | P1 | **Declared ✎** |

- Only **eligible repos** count: non-fork, with ≥ 5 qualifying player commits.
- **Tier** by the number of eligible repos with Verified evidence: Common 1 · Rare 3 · Epic 6 · Legendary 10 (and seen in the last 90 days). Tiers never go down (INT-4).
- Full marker list: `progression-tables.md` §7.

### E.4 Display

- **Build row** (README equipment section): 5–6 item icons. Frame colour shows the tier; a Tagged item has a dashed frame and a "tagged" note.
- **Declared kit** row: separate, ✎ marked, greyed, not in the build, and no stats.
- **Item tooltip text** (alt text and the equipment page): item name, category, tier, evidence type, number of repos, last seen. For GitHub Actions also the 30-day success rate (a derived informational stat, not a reward).

### E.5 Rules

- Only **Verified** items can be equipped. Tagged items can be equipped only into a single "Tagged" slot, rendered dashed (so topic-only tools stay visible without passing as verified).
- Items **do not** multiply EXP or BP.
- Items unlock item quests (for example Green Lane) and **set medals**: "Container Kit" (Docker + Compose + Nginx), "Quality Gate" (2 Tome items + Actions), "Full Build" (5 items Rare+).
- Equipping an unowned item → skipped with a warning. Two Boots → keep the first.

---

## F. Quest system

The full catalog is in `quest-catalog.md`. Rules:

### F.1 Quest types

| Type | Repeatable? | Period | Board | Reward |
| --- | --- | --- | --- | --- |
| Daily | Yes | Player day | 3 slots: slot 1 core, slot 2 variety, slot 3 any eligible | BP |
| Weekly | Yes | ISO week | 3 slots + 1 emblem specialty | BP |
| Collaborative | Yes (daily or weekly variants) | Day or week | Appear in the variety and weekly pools when eligible | BP |
| Season contract | Once per season | Season | 2 contracts per season | BP and a cosmetic |
| Milestone campaign | One-time | None (never expires) | Always visible as "Campaigns" | BP, title and map checkpoint |

### F.2 Eligibility

A quest enters the pool only if the player has done its activity type in the last 90 days, or owns the required item or emblem. Every board always has commit-based fallbacks. Collaborative quests need ≥ 1 verified ally or ≥ 1 contested objective in the last 90 days.

### F.3 Generation

`seed = hash(playerId, periodId, rulesetVersion, slot)`, then a weighted pick from the eligible pool for that slot, with no duplicates on the same board. The board is the same on every rerun and every machine.

### F.4 Verification

- Each quest is a predicate over **qualifying events with effective dates** in its period (PRD §4.4).
- Completion is recorded once as `quest:<questId>:<periodId>` with evidence keys.
- Collaborative predicates also check the human-account rule (§1.4).

### F.5 Expiration

- Daily and weekly quests: active during the period. The period **closes 48 h after it ends**, and incomplete quests then become `expired`.
- Season contracts expire at season closure.
- Milestone campaigns never expire. Steps finish in order; progress made before a step became active still counts if it is verifiable (for example, an earlier first release completes "Release Train 1" immediately).

### F.6 Stacking (with PRD STK-5)

- Quests give BP only, never EXP.
- **STK-11:** a milestone campaign step never shares an identical condition with a medal. If a medal and a step would overlap, the step gives no BP (progress only) and the medal pays.
- Completing a quest never counts toward another quest's "complete N quests" condition within the same period. Only season contracts count quest completions, and they count across periods.

---

## G. Achievements (Medals)

The full catalog is in `achievement-catalog.md`.

### G.1 Rarity

| Rarity | Design target ("an active player earns it within…") | BP | Extra reward |
| --- | --- | --- | --- |
| Common | First weeks | 25 | — |
| Uncommon | First season | 50 | — |
| Rare | First year | 100 | Title or badge style |
| Epic | Several years, or sustained collaboration | 200 | Frame |
| Legendary | Exceptional, long-term | 400 | Animated frame |

Rarity is a **design target**, not a measured population statistic (single-user product). The medal book says so.

### G.2 Rules

- **Prerequisites:** tiered families need the previous tier (for example Commits II needs Commits I). Some need a feature (equipment medals need P1 data).
- **Verification:** each medal is a pure rule over L1/L2/L3 data and stores its evidence keys and earned-on date (the date of the qualifying event).
- **Hidden medals** show as "???" with a one-line riddle hint.
- Config can hide medals from the README and cannot grant them.
- Medals are never called "Achievements" (INT-6).

---

## H. Season system

### H.1 Boundaries

- Seasons are calendar quarters in Asia/Jakarta: Q1 Jan 1 – Mar 31, Q2 Apr 1 – Jun 30, Q3 Jul 1 – Sep 30, Q4 Oct 1 – Dec 31 (00:00 to 23:59:59 local).
- **Season 1 = 2026-Q4 (2026-10-01 → 2026-12-31)**, assuming installation during that quarter. If the install slips into 2027, Season 1 becomes the install quarter.
- Each season has an original name and accent palette (for example S1 "Season of First Light").

### H.2 Lifecycle

`upcoming → active → closing (48 h after the end; late events can still land on the season's last days) → closed (immutable)`.

### H.3 Rewards (at closure)

- BP by **peak tier**: Initiate 100 · Squire 150 · Knight 250 · Warden 350 · Champion 500 · Paragon 650 · Ascendant 800 · Eternal 1,000.
- **Season badge** (permanent) with the peak tier, shown in the profile badge row (last 3 seasons).
- **Season frame** cosmetic for Champion and above.
- Season contracts and season-specific medals, if earned.

### H.4 Archival

At closure, the generator writes an **immutable season archive**: data snapshot `seasons/S<n>` plus a rendered `docs/legends/seasons/S<n>.md`, containing:

- final and peak rank, stars earned, banked stars lost, trials completed;
- battles (count by result), best battle, MVP count;
- quests completed (daily, weekly, contracts), BP earned and spent;
- medals earned that season, the top 3 heroes by MP gained, the emblem used most;
- personal records broken.

Archives are never rewritten. A ledger rebuild (PRD §8) produces a diff but leaves archives untouched unless the player explicitly confirms.

### H.5 Seasonal and lifetime relationship

Battles feed **both**: EXP (lifetime) is awarded per activity, while stars (seasonal) come from the day's battle result. Season resets touch only seasonal state (A.6). Lifetime systems never reset.

---

## I. Squad system

### I.1 Membership verification

| Status | Rule | Display |
| --- | --- | --- |
| **Verified ally** | Human account (§1.4) with ≥ 2 verified public interactions with the player in the last 90 days | Login and synergy |
| **Declared member** | Listed in config `squad.members` but not verified | ✎ "declared", greyed |
| **Mutual ally** (P2) | Verified ally whose own public GitHub Legends config lists the player | ✔✔ mark |
| Excluded | Bot, account < 30 days old, in `squad.hide`, or squad disabled | Not shown |

**Squad** = the player plus up to **4** verified allies with the highest synergy (a 5-member team).

### I.2 Collaboration metrics

| Metric | Definition | Points (synergy) |
| --- | --- | --- |
| Reviews given to the ally | Player's peer reviews on the ally's PRs | 3 each |
| Reviews received | The ally's reviews on the player's PRs | 3 each |
| Co-authored commits | Qualifying commits with a `Co-authored-by` trailer matching the ally's linked email | 2 each |
| Merges | PRs merged between the two (either direction) | 4 each |
| Shared repos | Repos where both have qualifying activity in 90 days | Displayed only, no points |

Synergy uses a rolling 90-day window. **Squad strength** = Σ synergy of the shown allies (a display stat).

### I.3 Rewards and quests

- New verified ally: +10 BP (50 per week cap).
- Collaborative quests (`quest-catalog.md` §4).
- Medals: Co-Op, Squad of Four, Peer Reviewer.

### I.4 Abuse and privacy

- The account-age and ≥ 2-interaction rules make throwaway sockpuppets costly.
- Synergy gives no EXP or stars. Contested objectives give MVPs and trials, and the "≥ 3 distinct human counterparts" Eternal condition limits a single sockpuppet.
- Other users' progression is never fetched (D-01). There is a hide list and an off switch.

---

## J. World map

### J.1 Structure and navigation hierarchy

```
World ("The Realms")          ← README overview SVG (collapsible section)
 ├── Main Path regions (6)    ← level-gated, linear
 │    └── Checkpoints (3 each)
 └── Domain regions (7)       ← emblem-gated side areas
      └── Checkpoints (3 each)
```

- **README:** one overview SVG with all regions, their states, and the player marker. Below it, a plain-text list of regions links to their pages.
- **`docs/legends/map/index.md`:** world page with a region table (state, gate, progress).
- **`docs/legends/map/<region>.md`:** region page with a checkpoint list, conditions, cleared dates and evidence links (medal, quest or ledger entries).
- There is no in-image interactivity (README limitation). Navigation uses Markdown links.

### J.2 Regions and checkpoints

**Main path (level gates)**

| Region | Gate | Checkpoints |
| --- | --- | --- |
| Starter Village | Level 1 | First Commit · First Victory · First Hero unlocked |
| Forest of Branches | Level 5 | First merged PR · 3 heroes discovered · First weekly quest |
| River of Reviews | Level 10 | First peer review · Reach Knight · First verified ally |
| Citadel of Releases | Level 20 | First qualifying release · Hero at Expert · Champion trial completed |
| Peaks of Mastery | Level 35 | 6 heroes unlocked · Emblem level 5 · Reach Paragon |
| Throne of Eternity | Level 50 | Reach Eternal · Hero at Virtuoso · 4 season badges |

**Domain regions (gate: matching emblem level ≥ 1 and player level ≥ 10)**

| Region | Emblem | Checkpoints (emblem levels 1 / 4 / 7, plus a signature condition) |
| --- | --- | --- |
| Lantern Spires | Frontend | L1 · L4 · L7 |
| Iron Forge | Backend | L1 · L4 · L7 |
| Twin Bridges | Full-stack | L1 · L4 · L7 |
| Observatory of Patterns | AI/ML | L1 · L4 · L7 |
| Harbor of Pipelines | DevOps | L1 · L4 · L7 |
| Vault of Records | Database | L1 · L4 · L7 |
| Open Commons | Open Source | L1 · L4 · L7 |

### J.3 Unlock rules

- A region unlocks when its gate is met. It is permanent.
- A checkpoint is **cleared** when its condition is met, even before the region unlocks; it then shows as cleared once the region opens.
- **Player marker:** the furthest unlocked main-path region with the most checkpoints cleared there. Domain regions show a small banner when all 3 are cleared.
- Region unlock gives +50 BP. Medals for all main-path regions ("Pathfinder") and all domain regions ("Cartographer").

### J.4 Visual states

| State | Rendering (code-generated SVG) |
| --- | --- |
| Hidden | Not drawn (domain region with emblem EP = 0) |
| Fogged | Desaturated silhouette with a "Lv 20" gate label |
| Unlocked | Full colour, checkpoints as hollow nodes |
| Cleared checkpoint | Filled node with a check glyph |
| Region complete | Banner flag |
| Current | Player marker (avatar ring) and a soft glow (static; animated only if enabled and reduced-motion is respected) |

Size budget < 100 KB; legible at 400 px wide (labels collapse to region initials, and the text list carries the names).

---

## K. Presentation summary (README)

Order (PRD §6.16): Player Card → Season strip (rank, stars, trial progress, days left) → Hero lineup (top 3) → Quest board (daily, weekly, active campaign step) → Medals strip → `<details>`: Battle History, Records, World Map, Squad, Build and Emblems → footer (provenance legend, health, how-it-works).

All art is code-generated (PD-16): a consistent role-glyph set, tier colour ramps per rank, Linguist technology colours as accents, and light and dark palettes via `<picture>`.

---

## L. Open design questions (non-blocking)

1. An eighth emblem for **Game Development** (Unity, Godot, Blender evidence). The owner's interests suggest yes. Proposed for P2.
2. A **Season Journey** track (season EXP milestones paying BP). Not adopted in v1, to avoid inflating BP; revisit after Season 1 data.
3. Hero **skins** content (palette names and patterns): to be authored in the visual design phase.
