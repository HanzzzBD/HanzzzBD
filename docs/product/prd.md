# GitHub Legends — Product Requirements Document

- **Version:** 0.1 (Phase 01, product definition)
- **Date:** 2026-10-20
- **Inputs:** `docs/discovery/repository-audit.md`, `docs/discovery/feasibility-analysis.md`, `docs/discovery/risks-and-constraints.md`, `docs/discovery/decision-register.md`
- **Companion docs:** `feature-catalog.md` (feature IDs and priorities), `acceptance-criteria.md` (testable criteria), `decision-register.md` (product decisions)
- **Status:** draft for owner review. No implementation.
- **Superseded values:** `docs/game-design/game-design-document.md` §0.2 (revisions R-01 to R-12) supersedes this PRD where the two differ: commit EXP curve, self-merge EXP, MVP rule, weekly star cap, promotion trials, soft-reset depth, emblems, medal rarity, equipment detection, quest types, map regions and ally verification.

---

## 1. Product summary

GitHub Legends turns a developer's verified GitHub activity into a MOBA-style progression game, inspired by the systems of Mobile Legends: Bang Bang. The player is the GitHub account owner. The game is computed by a generator that runs in GitHub Actions, and it is presented on the owner's GitHub Profile README.

**Product principle.** Game mechanics are not decoration. They decide:

- **progression**: EXP, levels, ranks and mastery are computed from a ledger of verified awards;
- **rewards**: Battle Points are earned and spent according to explicit economy rules;
- **unlock conditions**: heroes, emblems, map checkpoints and medals unlock only when verified conditions are met;
- **the data model**: every number traces back to verified events, ledger entries or declared configuration;
- **the experience**: the README reads as a player profile, not as a portfolio with game stickers.

### 1.1 Constraints inherited from Phase 00 (decided)

| Ref | Decision | Consequence for the product |
| --- | --- | --- |
| D-01 | Single-user, reusable | One player per installation. No cross-user features, no hosting. Everything is configurable, with no hard-coded username. |
| D-02 | Public data plus the anonymous private count | Private work counts toward EXP only as an aggregate. It is never named and never feeds detailed systems. |
| D-03 | Original names and art | No Mobile Legends names, heroes, ranks, logos or assets. Mechanics are inspired by the game, not copied from it. |
| D-04 | Persisted ledger | Awards are append-only and idempotent. Progress does not drop when API data ages out. |

### 1.2 Product decisions made in this phase

| Ref | Decision |
| --- | --- |
| P-01 | Battle Points are spent through **purchase entries in the player config file**, validated against the ledger by the next run. |
| P-02 | A hero is an **original character bound to one technology**. |
| P-03 | Leaderboards mean **personal records**: the player against their own past seasons and their own heroes. |
| P-04 | Rank uses a **soft reset per season and no demotion** during a season. |

Other decisions, with their status, are in `docs/product/decision-register.md`.

### 1.3 Goals and non-goals

**Goals**

1. Give the owner a reason to come back: daily and weekly quests, season rank, hero mastery.
2. Give visitors an honest, readable picture of the owner's activity in game form.
3. Make every displayed value traceable to its source.
4. Run unattended for months with no hosting cost.

**Non-goals (this product generation)**

- Comparing the player against other users (public ladders, real squads), because that needs a multi-user service.
- Real-time updates. The game updates on the generator schedule (daily by default).
- Measuring code quality or skill directly. The game measures **verified activity**. Labels like "mastery" describe sustained activity with a technology, not certified competence, and the README says so.
- Any interactive UI inside the README.

---

## 2. Personas

| Persona | Description | Primary needs |
| --- | --- | --- |
| **Player** (owner) | The GitHub account owner. Initially `HanzzzBD`, a student developer in UTC+7 working across web, backend, mobile and game dev. | Motivation to build consistently; a profile that stands out; control over what is shown |
| **Visitor** | Recruiters, peers, competition judges who open the profile | Understand quickly who the developer is and what they work with, without decoding a game |
| **Adopter** (later) | Another developer who installs the generator on their own profile repository | Clear config, safe defaults, no surprises |

---

## 3. Data integrity model

Every value in the system belongs to exactly one of four layers. The layer is stored with the value and shown in the README through a provenance marker.

| Layer | Marker | Definition | Examples | Can be edited by the player? |
| --- | --- | --- | --- | --- |
| **L1 Verified events** | ✔ Verified | Facts read from the GitHub API, normalised, with a stable source key | Commit `sha`, merged PR, submitted review, published release, workflow run, contribution calendar day, private contribution count | No |
| **L2 Ledger awards** | (internal) | Append-only records of EXP, BP, stars, unlocks and purchases granted by a rule for an L1 event, period or L4 request | `+10 EXP for commit abc123 under rule commit.v1` | No (only through config requests that the rules validate) |
| **L3 Derived state** | Σ Derived | Values computed deterministically from L1 + L2 + L4 | Level, rank, mastery tier, streak, quest progress, personal records | No |
| **L4 Player configuration** | ✎ Self-declared | Values the player declares in the config file | Title, motto, main hero, active emblem, equipped items, purchases, hidden items | Yes |

**Integrity rules**

- **INT-1.** No L3 value may be computed from an L4 value that claims activity or expertise. Config can **choose among** verified options (main hero, active emblem, equipment from owned items) or **hide** things. It cannot **add** them.
- **INT-2.** Self-declared content (title, motto, declared tools) is always rendered with the ✎ marker and never contributes to EXP, BP, rank, mastery or unlocks.
- **INT-3.** Every ledger award references the L1 key(s), period, or L4 request that caused it, plus the rule ID and rule version.
- **INT-4.** If a source disappears (repository deleted or made private), existing awards stay (they were verified when granted). They are marked `source_unavailable`, and any rendered detail is anonymised.
- **INT-5.** The generator must not render a value it could not compute. A failed data source produces a visible "data unavailable" state, never a zero that looks real and never a stale value presented as fresh.
- **INT-6.** The existing hand-written README content, including the real-world "🏆 Achievements" table, is never edited by the generator.

---

## 4. Activity model and stacking rules

### 4.1 Qualifying activities

An **activity** is one normalised L1 event that may produce awards. Only these activity types produce EXP or BP:

| Activity | Source key | Qualifies when |
| --- | --- | --- |
| `commit` | commit `sha` | On the default branch of a non-fork repository; authored by the player (linked email); not authored by a bot account; one parent (not a merge commit); additions + deletions > 0 |
| `pr.merged` | PR `node_id` | Authored by the player, merged |
| `pr.review` | review `id`, deduplicated per PR | Submitted by the player on a PR authored by someone else; state approved, changes requested, or commented with a non-empty body |
| `issue.opened` | issue `node_id` | Opened by the player; not a PR; not closed as spam or not planned within 24 h |
| `issue.resolved` | issue `node_id` | In a repository owned by the player, closed as completed (`state_reason = completed`) by the player |
| `release.published` | release `id` | Published (not draft) by the player in a repository the player owns or maintains |
| `private.contribution` | `private:<run-date>` | Increase in `restrictedContributionsCount` since the last recorded value |
| `workflow.run` | run `id` | Not an EXP activity. Used for quests, equipment and battle highlights only. |

**Bot rule.** An activity whose actor is a bot (login ends in `[bot]`, account type `Bot`, or the generator's own commits) never qualifies, even when a bot commits on the player's behalf.

### 4.2 Stacking rules

The same underlying work must not be rewarded twice in the same currency unless a stacking rule below allows it explicitly.

| ID | Rule |
| --- | --- |
| **STK-1** | Each `(activity key, rule id)` pair is awarded at most once, ever. A rerun, retry or overlapping window is a no-op. |
| **STK-2** | Commits and the PR that delivered them **stack**: commit EXP rewards authorship of default-branch commits, and `pr.merged` EXP rewards integration. A squash merge produces one default-branch commit, so commit EXP is awarded once for that commit. Branch commits that never reach the default branch earn nothing. |
| **STK-3** | Multiple reviews by the player on the same PR award `pr.review` **once**. |
| **STK-4** | An issue earns `issue.opened` and `issue.resolved` at most once each. Reopen and close cycles earn nothing extra. |
| **STK-5** | Quests and medals award **BP only, never EXP**. They count activity that was already rewarded with EXP, so granting EXP again would double-reward it. |
| **STK-6** | Battle (daily) results award **stars and BP, never EXP**. |
| **STK-7** | Level-up, season-end and medal BP are **milestone rewards**. They stack with activity BP because they reward reaching a state, not doing an activity. |
| **STK-8** | Emblem bonuses multiply **BP only**, apply to activity BP only (not to quest, medal or milestone BP), and do not compound with each other (only one emblem is active). |
| **STK-9** | The contribution calendar is used for streaks only. It never produces EXP, because its counts overlap with commit, PR and issue activities. |
| **STK-10** | Private contributions are a separate, aggregate-only source. They cannot overlap public activities, because the count covers private repositories only. |

### 4.3 Caps and dampening

Caps apply per **player day** (in the player's timezone, default `Asia/Jakarta`, see PD-05).

| Activity | Base EXP | Daily EXP cap | Other limits |
| --- | --- | --- | --- |
| `commit` | 10 | 100 | Commits with more than 5,000 changed lines earn base EXP only (no size bonus exists, so this only matters for flags) and are flagged for review in run logs |
| `pr.merged` (own repository, no review from another user) | 30 | 150 combined for all `pr.merged` | |
| `pr.merged` (reviewed by another user, or merged into a repository the player does not own) | 60 | (shared cap above) | |
| `pr.review` | 25 | 100 | |
| `issue.opened` | 10 | 30 | |
| `issue.resolved` | 15 | 45 | |
| `release.published` | 50 (full) / 20 (prerelease) | 100 | At most 1 rewarded release per repository per 7 days |
| `private.contribution` | 4 per contribution | — | 200 per ISO week |

The values are defaults and live in a versioned ruleset (see §8). An activity above the cap is still recorded as an L1 event, gets a zero-EXP ledger entry with reason `capped`, and still counts for quests, medals and battles.

### 4.4 Time attribution and backdating

Git author dates can be set to anything. To keep periodic systems honest:

- **Lifetime systems** (EXP, levels, mastery, medals) use the event date reported by GitHub: author date for commits, merge, review, close or publish time for the others.
- **Periodic systems** (battles, daily and weekly quests, season stars, streak-based medals) use the **effective date** = the later of the event date and `firstSeenAt − 48 h`, where `firstSeenAt` is when the collector first observed the event.
- A period (day, week, season) is **closed** 48 h after it ends. Events first seen after closure never change a closed period. They still earn lifetime EXP.
- **Initial backfill.** On first installation every historical event gets `firstSeenAt` equal to its event date. Backfill is therefore the only time history counts for periodic systems, and it is limited to the current season (see §10).

---

## 5. Primary user journeys

### 5.1 Visitor journey (profile page)

1. **Arrive** at `github.com/<player>`. The hand-written intro is unchanged at the top.
2. **Player Card** (one SVG, above the fold within the Legends block): avatar, display name, ✎ title, level and EXP bar, current rank and stars, main hero, active emblem, BP balance, current streak. A one-line text summary under the image repeats level, rank and season for screen readers and image-blocking clients.
3. **Season strip**: season name, days left, rank progress to the next tier.
4. **Hero lineup**: the top 3 heroes by mastery, with role, technology and mastery tier. A link goes to the full hero collection document.
5. **Quest board**: today's 3 daily quests and this week's weekly quests with progress, stamped "as of <generation time>".
6. **Medals**: the most recent and rarest medals, with a count of the total.
7. **Collapsible sections** (`<details>`): Battle History (last 10 battles), Personal Records, World Map, Allies, Equipment.
8. **Footer**: provenance legend (✔ Verified, Σ Derived, ✎ Self-declared), a link to "How GitHub Legends works", last generated time and generator health.

Design target: a visitor understands level, rank and main technologies within **5 seconds**, without opening any collapsible section.

### 5.2 Player journey (owner)

1. **Install**: add the generator workflow and the config file; add the README markers where the Legends block should appear.
2. **First run (backfill)**: lifetime EXP, heroes, mastery and medals are computed from history. Season 1 rank is computed from the current season's history (§10). A "Welcome, Legend" summary is written to the run summary.
3. **Daily loop**: the player works normally. The nightly run awards EXP and stars, resolves quests, and refreshes the README.
4. **Check progress**: the README and the generated `docs/legends/` pages (hero collection, medal book, shop catalog, ledger summary).
5. **Customise**: edit the config to set title, main hero, active emblem, equipment and purchases. The next run validates and applies the changes. The result appears in the run summary and the README.
6. **Season end**: soft reset, season rewards, season medal. A new season quest set appears.

---

## 6. System specifications

Every system follows the same template: Motivation · Core mechanic · Data inputs · Business rules · State transitions · Rewards · Unlock conditions · Edge cases · Abuse prevention · Acceptance criteria (summary; full criteria in `acceptance-criteria.md`).

---

### 6.1 Player identity and profile (SYS-01)

- **Motivation.** Visitors need to know who the player is at a glance. The player wants an identity that feels like a game account.
- **Core mechanic.** A **Player Card** combines verified identity (login, avatar, account age), derived progression (level, rank, streak, BP) and self-declared flavour (display name, title, motto). The player chooses an **unlocked title** and an **unlocked card frame**, and titles and frames come from medals and the shop.
- **Data inputs.** L1: user profile (login, avatar, created date). L3: level, rank, main hero, emblem, streak, BP. L4: display name, title choice, frame choice, motto.
- **Business rules.**
  - The avatar is embedded in the SVG (data URI). It is never hot-linked.
  - Display name and motto: max 32 and 80 characters; escaped; no links.
  - Title and frame: config may select only items in the player's unlocked inventory. An invalid selection falls back to the default with a warning.
  - "Player since" = GitHub account creation date (✔), not the install date.
- **State transitions.** `uninitialised → initialised` (first successful run) `→ active`. Each run refreshes derived fields. Config changes apply at the next run.
- **Rewards.** None directly. The card displays rewards earned elsewhere.
- **Unlock conditions.** Default title "Rookie" and frame "Plain". Further titles and frames come from medals (§6.10) and purchases (§6.4).
- **Edge cases.** Missing avatar → initials placeholder. A display name with emoji or right-to-left script → rendered with system fonts and truncated by measured width. A renamed login → the player ID is the numeric user ID, not the login.
- **Abuse prevention.** Self-declared text carries ✎. Config cannot set level, rank or BP; those fields do not exist in the config schema.
- **Acceptance (summary).** The card renders with all fields, every field shows its correct provenance, an invalid title falls back, and the SVG has no external references.

---

### 6.2 EXP, levels and progression (SYS-02)

- **Motivation.** Long-term, irreversible progress that reflects sustained building.
- **Core mechanic.** Verified activities earn EXP (§4.3). Lifetime EXP determines the **level**. EXP never decreases.
- **Data inputs.** L1 qualifying activities; L2 EXP awards.
- **Business rules.**
  - EXP to go from level *n* to *n+1* = `100 + 50 × (n − 1)`. Cumulative EXP to reach level *n* = `Σ_{k=1}^{n-1} (100 + 50(k−1))`. Equivalently `100(n−1) + 25(n−1)(n−2)`. Level 10 = 2,700 EXP; level 30 = 23,200 EXP; level 50 = 63,700 EXP.
  - Level cap: 100 (≈ 252,450 EXP). EXP keeps accumulating past the cap and is shown as "Legend Level 100 + overflow". Prestige is deferred.
  - Level = a pure function of lifetime EXP, recomputed every run from the ledger.
- **State transitions.** `level n → level n+1…` whenever cumulative EXP crosses a threshold. Several levels can be gained in one run (the backfill always does this). Levels never go down.
- **Rewards.** Each level gained: **+25 BP** (milestone, STK-7). Every 10th level: **+100 BP** plus a title unlock ("Veteran of 10", and so on).
- **Unlock conditions.** Level gates: shop tiers (L5, L15, L30), emblem slots (§6.7), map regions (§6.15).
- **Edge cases.** A ruleset change that would lower EXP applies prospectively only (§8); existing awards are not revoked. A repository deleted after awards were granted → awards kept (INT-4).
- **Abuse prevention.** Caps (§4.3), bot exclusion, empty and merge commit exclusion, fork exclusion. Daily caps also apply during backfill, so generated-history repositories are bounded.
- **Acceptance (summary).** Same input gives the same level; rerunning gives no extra EXP; capped events are recorded as zero; bot commits earn nothing.

---

### 6.3 Rank tiers and divisions (SYS-03)

- **Motivation.** A season-scoped goal that resets the race, like a ranked ladder.
- **Core mechanic.** **Stars** are earned from daily **battles** (§6.13). Stars fill **divisions**, and divisions make up **tiers**. Rank only rises within a season (P-04).
- **Tier ladder (original names, PD-01):**

| # | Tier | Divisions | Stars per division | Stars to clear tier | Cumulative stars to enter |
| --- | --- | --- | --- | --- | --- |
| 1 | Initiate | III, II, I | 3 | 9 | 0 |
| 2 | Squire | III, II, I | 3 | 9 | 9 |
| 3 | Knight | III, II, I | 4 | 12 | 18 |
| 4 | Warden | III, II, I | 4 | 12 | 30 |
| 5 | Champion | III, II, I | 5 | 15 | 42 |
| 6 | Paragon | III, II, I | 5 | 15 | 57 |
| 7 | Ascendant | — | 20 | 20 | 72 |
| 8 | Eternal | — | unbounded (star count shown) | — | 92 |

  Calibration: a season is about 91 days. A player with about 4 victories a week (about 52 stars) ends near Champion. Reaching Eternal needs near-daily victories with frequent MVPs.

- **Data inputs.** L2 star awards for the current season.
- **Business rules.**
  - Rank = a function of the season's cumulative stars plus the starting stars carried from the soft reset.
  - There is no demotion and no star loss. Inactivity only pauses progress.
  - Promotion is immediate when the star threshold is reached.
- **State transitions.** `division d → d−1 → … → next tier division III → … → Eternal`. At a season boundary: `final rank → soft-reset rank` (§6.11).
- **Rewards.** Reaching a new tier for the first time in a season gives BP: Squire 30, Knight 50, Warden 80, Champion 120, Paragon 180, Ascendant 250, Eternal 400. Season-end rewards are in §6.11.
- **Unlock conditions.** All players start Season 1 at Initiate III with 0 stars (subject to the backfill in §10).
- **Edge cases.** A season boundary at mid-run: battles are assigned by effective date. Late events after the 48 h closure do not add stars to a closed season.
- **Abuse prevention.** At most 2 stars per day (§6.13). Stars come only from battles, which use capped EXP.
- **Acceptance (summary).** The star thresholds produce the table above exactly, rank never decreases within a season, and a closed day ignores late events.

---

### 6.4 Battle Points and virtual economy (SYS-04)

- **Motivation.** A spendable reward that makes daily play and choices matter, separate from long-term EXP.
- **Purpose split (economy principle):**

| | EXP | Battle Points (BP) |
| --- | --- | --- |
| Represents | Long-term verified progression | Rewards to spend |
| Earned from | Qualifying activities (§4.3) | Battles, quests, medals, milestones, activity (with emblem bonus) |
| Spent? | Never | Yes, in the shop |
| Can decrease? | Never | Yes, through purchases only |
| Affects | Level | Cosmetics, emblem unlocks, convenience |
| Can buy progression or expertise? | — | **No.** BP never buys EXP, stars, mastery, heroes or medals. |

- **Core mechanic.** BP sources go to a balance in the ledger. Purchases are declared in the config file (P-01). Each run validates and settles them.
- **BP sources (defaults):**

| Source | Amount | Notes |
| --- | --- | --- |
| Activity BP | 20% of the EXP awarded by the activity, rounded down | Emblem bonus applies (STK-8) |
| Battle victory / MVP | 15 / +15 | §6.13 |
| Daily quest | 10–25 each | §6.9 |
| Weekly quest | 50–150 each | §6.9 |
| Medals | 25 / 75 / 200 (bronze / silver / gold) | §6.10 |
| Level-up | 25 per level, +100 every 10 levels | §6.2 |
| Tier first reached | 30–400 | §6.3 |
| Season end | 100–1,000 by peak tier | §6.11 |

- **Weekly earn cap.** Activity BP plus battle BP are capped at **700 BP per ISO week** (the "weekly BP cap" mechanic). Quest, medal and milestone BP are not capped.
- **Sinks (shop catalog, PD-07):** hero skins (card art variants), card frames, titles, map themes, emblem set unlocks (§6.7), extra equipment slot (§6.8, once), quest reroll tokens (deferred).
- **Purchase flow (config purchases):**
  1. The player adds `{ requestId, itemId }` to `purchases` in the config file.
  2. The next run processes **new** requestIds in file order.
  3. For each: the item exists and is listed, the level or rank requirement is met, the player does not already own it (unless it is consumable), and the balance ≥ price **at that moment**.
  4. Valid → ledger `purchase` entry (negative BP) and an inventory grant. Invalid → ledger `purchase_rejected` entry with a reason. The requestId is consumed either way.
  5. The result appears in the run summary and in the README "last transaction" line.
- **Business rules.** The balance can never go negative. A purchase is final (no refunds in MVP). Removing a purchase line from config changes nothing. Prices are fixed for a season; a price change applies only to new requestIds.
- **State transitions (purchase):** `declared → validated → settled | rejected`. Terminal states are immutable.
- **Unlock conditions.** Shop tiers unlock at L5 (basic), L15 (rare), L30 (epic). Some items need a peak rank.
- **Edge cases.** Duplicate requestId → the second is ignored and a warning is written. Two purchases that together exceed the balance → the first settles and the second is rejected for insufficient BP. Item delisted after declaration → rejected as `unavailable`. Config file has a syntax error → purchase processing is skipped for the run (no partial processing) and the error is reported.
- **Abuse prevention.** Ledger-only balance (the config cannot set BP). requestIds are idempotent. Weekly cap. BP cannot buy verified-derived status.
- **Acceptance (summary).** Balance = Σ ledger. Rejected purchases leave the balance unchanged. A rerun does not double-charge. Over-balance purchases are rejected.

---

### 6.5 Technology-based hero collection (SYS-05)

- **Motivation.** Show the player's technologies as a collection to grow, and show what they actually work with.
- **Core mechanic.** A catalog of **original heroes**, each bound to exactly one technology (P-02). A hero is **unlocked** when verified evidence of the player using that technology meets the threshold. Heroes have a **role** that groups technologies:

| Role | Technology domain | Example bindings (catalog, PD-08) |
| --- | --- | --- |
| Mage | Frontend and UI languages | TypeScript, JavaScript, HTML, CSS, Vue, Svelte |
| Fighter | Backend and application languages | PHP, C#, Java, Go, Kotlin, Ruby |
| Marksman | Data, AI and scripting | Python, Jupyter Notebook, R |
| Assassin | Systems and performance | Rust, C, C++, Zig |
| Tank | Infrastructure and operations | Shell, Dockerfile, HCL, Nix, PowerShell |
| Support | Tooling, config and game tech | ShaderLab, GDScript, Makefile, Lua |

  Each hero has an original name, epithet, role, technology, short lore line and base art (for example, a TypeScript Mage). The catalog is data, versioned with the ruleset.

- **Data inputs.** L1: repository language bytes (Linguist), repository flags (fork, archived, owner), the player's verified commits per repository.
- **Business rules.**
  - **Weighted usage** for technology *T*: `Σ over eligible repos (playerCommitEXP(repo) × share(repo, T))`, where `share` is *T*'s byte share in that repo. Eligible repos: non-fork, with ≥ 1 qualifying player commit. Languages marked vendored or generated by Linguist are already excluded by GitHub.
  - **Unlock threshold:** weighted usage ≥ 100 **and** *T* has share ≥ 10% in at least one eligible repo with ≥ 5 qualifying player commits.
  - A technology with no hero in the catalog is listed as an "Unknown Spirit" entry (verified usage shown, no art) until the catalog adds one.
  - Framework heroes (React, Laravel, and so on) are not in MVP: Linguist reports languages, not frameworks (deferred, see PD-09).
  - Private repositories are not used (D-02). Heroes reflect public work only, and the hero collection page says so.
- **State transitions.** `undiscovered → discovered` (weighted usage > 0, shown as a silhouette) `→ unlocked` (threshold met). Unlocking is permanent (INT-4).
- **Rewards.** Unlocking a hero: +50 BP (milestone). Collection medals at 3, 6 and 10 heroes, and for one hero in each role.
- **Unlock conditions.** As in the business rules. Config cannot unlock heroes; it can only hide unlocked ones from the README or choose the **main hero**.
- **Edge cases.** A repo whose languages change drastically (a rewrite) → mastery already earned stays and new attribution follows the current share. Monorepo with many languages → share-weighted. Vendored code not detected by Linguist → share inflated; mitigated by the 5-commit and 10% rules and by an optional config `excludeRepos` list (excluding can only reduce credit, so it does not break INT-1).
- **Abuse prevention.** Credit flows only through the player's own qualifying commit EXP, so a dumped language file earns nothing without capped commits. Forks are excluded.
- **Acceptance (summary).** A hero unlocks only above the threshold, forks contribute nothing, hiding a hero does not change stats, and the main hero must be unlocked.

---

### 6.6 Hero mastery (SYS-06)

- **Motivation.** Depth in a technology, not just breadth.
- **Core mechanic.** **Mastery points (MP)** per hero = the weighted usage from §6.5 (lifetime, from ledger EXP). Mastery tiers:

| Tier | MP |
| --- | --- |
| Novice | 100 (at unlock) |
| Adept | 1,000 |
| Veteran | 3,000 |
| Expert | 8,000 |
| Virtuoso | 20,000 |
| Exalted | 50,000 |

- **Data inputs.** L2 commit EXP per repo; L1 repository language shares (snapshotted per run).
- **Business rules.**
  - MP is attributed at award time, using the language shares of that run (snapshot stored with the award). Later share changes do not rewrite past MP.
  - Only commit EXP feeds MP. PR, review and issue EXP cannot be reliably attributed to a language and is excluded (avoids double attribution).
  - The README shows mastery with the caption "Mastery reflects verified activity volume, not assessed skill."
- **State transitions.** Tiers only increase.
- **Rewards.** Each tier reached: BP 30 / 60 / 120 / 250 / 500 (Adept → Exalted) plus a hero skin unlock at Expert and an animated frame at Exalted.
- **Unlock conditions.** Requires the hero to be unlocked.
- **Edge cases.** Backfilled history with no language snapshot for old periods → use the current shares and flag the MP as `approximate` in the ledger.
- **Abuse prevention.** Inherits the commit caps. There is no other MP source.
- **Acceptance (summary).** Σ MP over heroes ≤ Σ commit EXP; tiers are monotonic; snapshots are stored.

---

### 6.7 Emblems and specializations (SYS-07)

- **Motivation.** Let the player express a playstyle and make that choice matter.
- **Core mechanic.** Six **emblems**, each tied to a kind of activity. Each emblem has a level (1–10) from verified activity of its kind. The player equips **one active emblem**, which gives a BP bonus for its activity and adds a specialty quest to the quest pool.

| Emblem | Activity that levels it | Active bonus (BP only) | Specialty quest example |
| --- | --- | --- | --- |
| Builder | Qualifying commits | +15% commit BP | "Commit on 3 different days this week" |
| Integrator | Merged PRs | +15% PR BP | "Merge a PR reviewed by someone else" |
| Reviewer | Reviews given | +15% review BP | "Review 2 PRs" |
| Maintainer | Issues resolved and releases | +15% issue and release BP | "Close an issue as completed" |
| Operator | Successful workflow runs in owned repos | +15% battle BP | "Get a green CI run on a push" |
| Explorer | New repos and languages touched | +15% hero-unlock BP | "Commit to a repo you haven't touched in 30 days" |

- **Data inputs.** L1 activity counts per kind; L4 active emblem choice.
- **Business rules.**
  - Emblem level thresholds (count of qualifying activities of the kind): 1, 10, 25, 50, 100, 200, 350, 550, 800, 1,200.
  - Emblems 1–3 (Builder, Integrator, Reviewer) are available from the start. The others unlock with BP in the shop (200 BP each, level ≥ 10).
  - The active emblem can be changed at most **once per 7 days**. A change inside the cooldown is ignored with a warning.
  - The README shows the active emblem (✎ choice) with its level (Σ). A "suggested emblem" is the highest-level emblem.
  - Talents within an emblem are deferred.
- **State transitions.** `locked → owned → active ↔ owned`. Levels only increase.
- **Rewards.** Emblem level-ups: +20 BP × new level.
- **Edge cases.** Choosing a locked emblem → falls back to the previous active emblem (or Builder). Operator emblem with no CI anywhere → stays at level 0 and is still purchasable.
- **Abuse prevention.** The bonus affects BP only, so it is subject to the weekly cap. The cooldown prevents switching every day to stack bonuses. Bot-triggered workflow runs (schedule or bot actors) do not count for Operator.
- **Acceptance (summary).** The bonus applies only to matching activity BP, the cooldown is enforced, and a locked emblem cannot be activated.

---

### 6.8 Equipment and development tools (SYS-08)

- **Motivation.** Show the toolchain ("build") the player uses, and connect tools to gameplay.
- **Core mechanic.** **Items** represent development tools (for example Docker, GitHub Actions, pnpm, Prisma, Nginx). An item is **owned** when verified evidence shows the tool in an eligible repository. The player equips up to **5 items** (6 with the purchased slot) as their **build**.
- **Data inputs.** L1: workflow runs (GitHub Actions); repository topics; detection of marker files in eligible repos (`Dockerfile`, `pnpm-lock.yaml`, `prisma/schema.prisma`, and so on; detection depth per PD-09). L4: equipped build, declared tools.
- **Business rules.**
  - **Owned item tiers** by the number of eligible repos with evidence: Common (1), Rare (3), Epic (6), Legendary (10 and at least one use in the last 90 days).
  - **Declared tools** in config (for example Unity, Blender) are shown in a separate "Declared kit" row with ✎. They cannot be equipped in the verified build and never give rewards.
  - Equipped items give **no** EXP or BP multipliers. They unlock item-specific quests in the pool (for example "GitHub Actions equipped → 'Green Lane' quest").
- **State transitions.** `unseen → owned(tier)`, and the tier only increases (INT-4). `owned → equipped ↔ owned`.
- **Rewards.** First time an item reaches Epic: +50 BP. The "Full Build" medal for 5 equipped items at Rare or above.
- **Unlock conditions.** Owned through evidence only. The sixth slot costs 300 BP (once).
- **Edge cases.** A tool detected only in a fork → not counted. A marker file present but unused (stale Dockerfile) → still counted, which is an accepted inaccuracy, and the tier needs multiple repos.
- **Abuse prevention.** Detection requires eligible repos (≥ 5 qualifying player commits). Items never affect EXP.
- **Acceptance (summary).** A declared tool cannot enter the build, an unowned item cannot be equipped, and the tier follows the repo counts.

---

### 6.9 Daily and weekly quests (SYS-09)

- **Motivation.** Short-term goals that build habits and give a reason to return.
- **Core mechanic.** Each player day gets **3 daily quests**; each ISO week gets **3 weekly quests** (+1 specialty quest from the active emblem). Quests are drawn **deterministically** from an eligible pool using the seed `hash(playerId, periodId, rulesetVersion)`, so reruns produce the same board.
- **Data inputs.** L1 events with effective dates (§4.4); L3 eligibility (owned items, active emblem, heroes); quest pool (ruleset data).
- **Example pool:**

| Quest | Period | Objective | Reward (BP) |
| --- | --- | --- | --- |
| First Blood | Daily | 1 qualifying commit | 10 |
| Triple Push | Daily | Qualifying commits on 3 different repos or ≥ 3 commits | 20 |
| Second Opinion | Daily | 1 qualifying review | 20 |
| Objective Secured | Daily | 1 merged PR | 25 |
| Green Lane | Daily | 1 successful push-triggered workflow run in an owned repo (requires the GitHub Actions item) | 15 |
| Steady Hands | Weekly | Victory in 4 battles | 100 |
| Siege | Weekly | 3 merged PRs | 120 |
| Bug Hunter | Weekly | Resolve 2 issues | 80 |
| Dual Wield | Weekly | Qualifying commits in repos of 2 different heroes | 80 |
| Ship Day | Weekly | Publish 1 release | 150 |

- **Business rules.**
  - The daily period is player-local midnight to midnight; the weekly period runs Monday 00:00 to Sunday 24:00 (PD-05).
  - Progress counts events whose **effective date** falls in the period (late or backdated events do not count, §4.4).
  - Completion is evaluated every run. A completed quest is awarded once (`quest:<periodId>:<questId>`).
  - A quest is eligible only if the player could plausibly complete it (for example review quests need ≥ 1 review in the last 90 days; Green Lane needs the GitHub Actions item). The pool always contains commit-based fallbacks.
  - A period is closed 48 h after it ends. Incomplete quests then become `expired`.
  - Rewards are BP only (STK-5).
- **State transitions.** `scheduled → active → completed (rewarded) | expired`.
- **Rewards.** As in the table. Weekly bonus: all 3 dailies on ≥ 5 days in a week → +50 BP "Dedication" bonus.
- **Unlock conditions.** Weekly quests unlock at level 3 (so the backfill doesn't flood). The specialty slot needs an active emblem.
- **Edge cases.** A generator run is missed for a day → the next run still evaluates the previous day (within the grace window). The README board shows the latest period and labels the time of evaluation. A timezone change in config → applies from the next day boundary, and closed periods are untouched.
- **Abuse prevention.** Deterministic boards (no rerolling by rerunning). Effective dates. Only qualifying activities count, so bot and empty commits never complete quests.
- **Acceptance (summary).** The same seed gives the same board, a late event does not complete a closed quest, and a quest is rewarded only once.

---

### 6.10 Achievements and badges ("Medals") (SYS-10)

- **Motivation.** Celebrate milestones permanently.
- **Naming.** Game achievements are called **Medals**, so they are never confused with the README's real-world "🏆 Achievements" table (INT-6).
- **Core mechanic.** Rule-based, one-time medals with tiers (Bronze, Silver, Gold). Each medal stores its **evidence** (the qualifying L1 keys) and its **earned-on** date (the date of the qualifying event, so backfilled medals show their historical dates).
- **Starter set (MVP, about 20):** First Commit; First Merged PR; First Review; First Release; Commits 100/1,000/5,000; Merged PRs 10/50/200; Reviews 10/50/200; Streak 7/30/100 days; Heroes 3/6/10; All Roles (one hero per role); Season Finisher (season ended at Knight+); Weekender; Night Owl (deferred, needs reliable local time); Collaborator (PR merged in a repo the player does not own).
- **Data inputs.** L1 and L2 (counts, streaks from the contribution calendar, hero unlocks).
- **Business rules.**
  - A medal is awarded once per tier. Tiers are independent ledger entries (`medal:<id>:<tier>`).
  - **Hidden medals** show as "???" until earned.
  - Medal rules are pure functions of verified data. Config can hide medals from the README but cannot grant them.
- **State transitions.** `locked → earned(tier)`, permanent.
- **Rewards.** BP 25 / 75 / 200 by tier, plus a title or frame where defined.
- **Unlock conditions.** Per medal definition.
- **Edge cases.** A streak medal earned during backfill → the date is that of the last day of the qualifying streak. A rule change that adds a medal → evaluated on full history at the next run, with historical dates.
- **Abuse prevention.** Count-based medals use qualifying activities only (caps do not reduce counts, but bot, empty and merge commits are excluded). Streaks use the GitHub contribution calendar, which counts the player's linked contributions.
- **Acceptance (summary).** Each medal has evidence, is not awarded twice, and is not grantable by config.

---

### 6.11 Seasons (SYS-11)

- **Motivation.** Periodic fresh starts and time-limited goals.
- **Core mechanic.** **Quarterly seasons** (PD-04) with a name, theme and season-specific medal. At season end: rewards, then soft reset.
- **Data inputs.** L4/ruleset season calendar; L2 stars.
- **Business rules.**
  - The default calendar aligns to calendar quarters in the player's timezone. Season 1 is the quarter in which the player installs (§10).
  - **Soft reset:** the next season starts **2 tiers below** the final tier, at division III with 0 stars, never below Initiate III: Eternal → Paragon III, Ascendant → Champion III, Paragon → Warden III, Champion → Knight III, Warden → Squire III, Knight or lower → Initiate III. Starting stars = the cumulative stars needed to enter that tier.
  - **Season end rewards** by peak tier: Initiate 100, Squire 150, Knight 250, Warden 350, Champion 500, Paragon 650, Ascendant 800, Eternal 1,000 BP, plus a permanent **season badge** with the peak tier.
  - Season rollover is processed exactly once (`season:<id>:close`), after the 48 h closure.
- **State transitions.** `upcoming → active → closing (48 h grace) → closed`.
- **Rewards.** As above.
- **Edge cases.** The generator is down across a boundary → the first run afterwards closes the season once and opens the next with the correct rank. Season calendar changed mid-season → applies from the next season only.
- **Abuse prevention.** Stars come only from battles (capped). Rollover is idempotent.
- **Acceptance (summary).** The reset mapping is exact, rewards are paid once, and closed seasons are immutable.

---

### 6.12 Squad and collaboration (SYS-12)

- **Motivation.** Development is a team game. Show and reward collaboration.
- **Core mechanic (single-user form).** **Allies** are GitHub users the player has verified public interactions with: reviewed the player's PR, had a PR reviewed by the player, co-authored a commit (`Co-authored-by` trailer matched to a GitHub user), or merged the player's PR in their repo. The **Squad** shows the top 4 allies by **synergy** over the last 90 days.
- **Data inputs.** L1 public PRs, reviews, commit trailers.
- **Business rules.**
  - Synergy points: review given or received 3, co-authored commit 2, PR merged by or for the ally 4. Window: rolling 90 days.
  - Bots are excluded. Allies are shown by login only, with no avatars (keeps size small and avoids embedding others' images); optionally a link to their profile.
  - Config `squad.enabled` (default true) and `squad.hide: [logins]`.
  - Allies' own progression is **never** shown (single-user scope, D-01).
- **State transitions.** An ally enters or leaves the squad as the 90-day window moves.
- **Rewards.** Collaboration BP: first interaction with a new ally +10 BP (capped at 50 BP a week). The "Collaborator" medals.
- **Unlock conditions.** The squad section appears after the first ally.
- **Edge cases.** A co-author email not linked to a GitHub user → counted as "unknown ally" in totals and not displayed. An ally renames → identity is the user ID.
- **Abuse prevention.** Interactions must be verified public events. Sockpuppet accounts can inflate synergy, but synergy grants no EXP and BP is capped, so the incentive is minimal.
- **Acceptance (summary).** Hidden allies never render, bots are excluded, and the 90-day window is honoured.
- **Deferred.** Real squads with shared goals and other players' data need a multi-user service.

---

### 6.13 Battle history (SYS-13)

- **Motivation.** A match log that turns days of work into memorable entries.
- **Core mechanic.** Each player day with at least one qualifying activity is a **battle**. The battle's **score** = EXP awarded that day after caps (effective dates).

| Result | Condition | Stars | BP |
| --- | --- | --- | --- |
| Skirmish | Score 1–29 | 0 | 0 |
| Victory | Score ≥ 30 | +1 | 15 |
| MVP Victory | Score ≥ 120 **and** at least one *objective* (merged PR, review, resolved issue, or release) | +2 | 30 |

  Days with no qualifying activity are not battles: no defeat, no penalty.

- **Highlights.** Each battle lists up to 3 highlights in priority order: release > merged PR > review > resolved issue > commits summary. A highlight from a private repository never appears (D-02).
- **Data inputs.** L2 awards by effective date; L1 details for highlights.
- **Business rules.** A battle is final after the day's 48 h closure. Battle history is kept in the ledger forever (it does not depend on API retention). The README shows the last 10 battles; the full log is in a generated document.
- **State transitions.** `open (day in progress or within grace) → final`.
- **Rewards.** As in the table (stars feed rank, §6.3).
- **Edge cases.** Day with only private contributions → not a battle (private EXP has no day attribution). Day straddling a season boundary → assigned by the player-local date.
- **Abuse prevention.** The score uses capped EXP, so at most 2 stars a day. The objective requirement for MVP rewards meaningful work.
- **Acceptance (summary).** Result thresholds are exact, the history survives API retention windows, and private highlights never render.

---

### 6.14 Leaderboards (SYS-14)

- **Motivation.** Competitive drive without other users' data (P-03).
- **Core mechanic.** **Personal Records** plus **internal rankings**:
  - Records: best battle score; most stars in a season; longest streak; most EXP in a week; most medals in a season; highest peak tier.
  - **Season ladder:** each past season ranked by stars, with the current one highlighted ("Season 3 is your #2 best").
  - **Hero ladder:** the player's heroes ranked by mastery.
- **Data inputs.** L2 and L3 history.
- **Business rules.** A record changes only when strictly beaten; the date and value are stored. Records computed from backfill are marked "pre-launch" where they use pre-season-1 data.
- **State transitions.** `record(value, date) → record(new value, new date)`.
- **Rewards.** Breaking a record (after the first season): +30 BP, at most once per record per week.
- **Edge cases.** Ties do not replace the record.
- **Abuse prevention.** Records are built on capped values.
- **Acceptance (summary).** Ties do not replace records, and the season ladder order is correct.
- **Deferred.** The opt-in public ladder needs an aggregator service.

---

### 6.15 World map and progression checkpoints (SYS-15)

- **Motivation.** A visual journey that shows how far the player has come and what is next.
- **Core mechanic.** A static SVG map of an original world ("The Realms", PD-01) with **regions** gated by level and **checkpoints** gated by verified milestones. The player marker sits at the furthest unlocked checkpoint along the main path.

| Region | Level gate | Example checkpoints |
| --- | --- | --- |
| Starter Village | 1 | First Commit · First Hero |
| Forest of Branches | 5 | First Merged PR · 3 Heroes |
| River of Reviews | 10 | First Review · Knight reached |
| Citadel of Releases | 20 | First Release · Mastery Expert |
| Peaks of Mastery | 35 | 6 Heroes · Champion reached |
| Throne of Eternity | 50 | Eternal reached · Exalted mastery |

- **Data inputs.** L3 level, rank, medals, heroes.
- **Business rules.** Checkpoints are ordered, but one can be completed before its region unlocks; it then shows as "cleared" when the region opens. A locked checkpoint shows its condition text. Map themes are cosmetic (purchasable).
- **State transitions.** `region locked → unlocked`; `checkpoint locked → cleared`, permanent.
- **Rewards.** Region unlock: +50 BP. The "Cartographer" medal when all regions are unlocked.
- **Edge cases.** Narrow screens: the map must be legible at 400 px width (simplified labels).
- **Abuse prevention.** Gates are verified or derived only.
- **Acceptance (summary).** The marker position is correct, locked conditions are displayed, and the SVG is self-contained and < 100 KB.
- **Deferred.** An interactive map needs a web app.

---

### 6.16 GitHub Profile README integration (SYS-16)

- **Motivation.** The README is the product surface.
- **Core mechanic.** The generator writes **only** between `<!-- LEGENDS:START -->` and `<!-- LEGENDS:END -->`, using generated SVGs plus Markdown text.
- **Layout (in order):** Player Card · Season strip · Hero lineup · Quest board · Medals · `<details>` sections (Battle History, Personal Records, World Map, Squad, Equipment) · footer (provenance legend, last updated, health, how-it-works link).
- **Business rules.**
  - Missing or duplicated markers → the run makes **no** README change and fails the README step with a clear message (INT-6).
  - Dark and light variants via `<picture>`.
  - Every image has descriptive alt text. Key facts are also in text.
  - Budget: README block < 15 KB; each SVG < 100 KB; total generated assets < 1 MB.
  - Deterministic output: unchanged state → byte-identical files → no commit.
  - Sections can be toggled in config (`sections:`).
  - **Health:** if the last successful data refresh is older than 3 days, the footer shows "⚠ Data may be stale (last refresh <date>)".
  - The existing third-party stat cards stay outside the markers. Their removal is the player's choice (Phase 00, D-10).
- **State transitions.** `README unchanged → updated (commit)`; or `blocked (marker error)`.
- **Edge cases.** The player edits inside the markers by hand → overwritten next run (documented in the block's leading comment). README renamed or moved → the run fails safe.
- **Abuse prevention.** n/a (output layer). All strings are escaped (security).
- **Acceptance (summary).** Content outside the markers is byte-identical after a run, and a no-change run creates no commit.

---

## 7. Cross-cutting requirements

### 7.1 Ledger (all systems)

- Append-only entries: `{ entryId, kind (exp|bp|star|unlock|purchase|medal|quest|season), amount, sourceKeys[], ruleId, ruleVersion, effectiveDate, eventDate, season, createdAt, flags[] }`.
- Idempotency key: `(kind, ruleId, sourceKey/periodId)`.
- Every derived value is reproducible from ledger + L1 snapshot + config.
- A **ledger summary** document is generated (totals by kind and rule, last 50 entries), for transparency.

### 7.2 Privacy

- Nothing from a private repository is ever named or detailed (D-02). Only the aggregate private-contribution EXP appears, labelled "Private contributions (aggregate)".
- Allies are other people, so they get hide controls (§6.12).
- The config can disable any section.

### 7.3 Accessibility

- Alt text on every image. Text equivalents for level, rank, season and quests. Colour is never the only signal (progress bars carry numbers). Animations respect `prefers-reduced-motion` and are off by default.

### 7.4 Trust and transparency

- A generated "How GitHub Legends works" page explains the EXP sources, caps and provenance markers in plain language.
- A visitor can answer "where does this number come from?" within two clicks.

### 7.5 Reusability

- Player identity, timezone, season calendar, catalogs (heroes, items, shop, quests, medals) and rule values are configuration or versioned data. There are no hard-coded logins.

---

## 8. Ruleset versioning and rescoring

- Rules (EXP values, caps, thresholds, catalogs) form a **ruleset** with a semantic version.
- **Default:** a ruleset change applies **prospectively**. Existing ledger entries keep their original ruleVersion.
- A **rebuild** (explicit maintenance action) recomputes the whole ledger under the current ruleset from L1 history plus snapshots, preserving purchases and processed requestIds. Because history from the API can be incomplete, a rebuild must report the differences before replacing the ledger, and it requires an explicit confirmation flag.

---

## 9. Metrics for product success

| Metric | Target |
| --- | --- |
| Generator success rate (scheduled runs) | ≥ 98% over 30 days |
| Data freshness | README refreshed within 26 h of each player day |
| Visitor comprehension | Level, rank and main tech understandable without expanding any section (qualitative review) |
| Player engagement (owner self-report) | Owner checks quests at least weekly during the first season |
| Integrity | 0 known double awards; 0 values without provenance |

---

## 10. Initial backfill policy

- **Lifetime systems** (EXP, levels, heroes, mastery, medals, equipment, emblem levels, records): computed from full available history (one GraphQL window per year since account creation, plus per-repo data).
- **Season 1**: the current calendar quarter. Battles, stars and quests for days in that quarter before installation are computed from history (effective date = event date during backfill), so the player starts with a fair rank. Days before the quarter start do not produce battles or stars.
- **Milestone BP** from backfill (levels, medals, heroes) **is granted**, so the player can use the shop immediately. Activity BP before Season 1 is **not** granted (it would be very large and is not part of the season economy). Recorded as PD-10.

---

## 11. MVP scope (prioritised)

Priority labels match `feature-catalog.md`.

| Priority | Scope | Why first |
| --- | --- | --- |
| **P0-1** | Data ingestion (public commits, PRs, reviews, issues, releases, contribution calendar, private count) with normalisation, bot, fork, empty and merge filters | Everything depends on it |
| **P0-2** | Ledger with idempotency, stacking rules, caps, effective dates | Integrity foundation (D-04) |
| **P0-3** | EXP and levels | Core long-term progression |
| **P0-4** | Battles, stars, rank tiers, Season 1 with soft-reset logic | Core seasonal loop |
| **P0-5** | BP earning and balance (all sources in MVP systems) | Economy foundation |
| **P0-6** | Hero collection (language heroes, initial catalog of about 15 heroes) and mastery | Identity and technology story |
| **P0-7** | Daily and weekly quests (deterministic boards, base pool) | Return motivation |
| **P0-8** | Medals starter set (about 20) | Milestones |
| **P0-9** | Player Card SVG, Season strip, Hero lineup, Quest board, Medals strip, Battle History (text), README marker integration, provenance legend, health line | The product surface |
| **P0-10** | Ledger summary and "How it works" pages | Transparency |

**MVP exit criteria:** all P0 acceptance criteria pass on recorded fixtures; one week of unattended daily runs on the live profile with no double awards and no marker violations.

## 12. Post-MVP (prioritised)

| Priority | Feature |
| --- | --- |
| **P1-1** | Shop and config purchases (cosmetics: frames, titles, hero skins) |
| **P1-2** | Emblems (levels, active emblem, BP bonus, specialty quests, purchasable sets) |
| **P1-3** | World map SVG with regions and checkpoints |
| **P1-4** | Personal records and season or hero ladders |
| **P1-5** | Squad and allies |
| **P1-6** | Equipment: GitHub Actions detection plus config build; declared kit |

## 13. Deferred features

| Feature | Reason deferred | Prerequisite |
| --- | --- | --- |
| Equipment detection via manifest and marker-file scanning | API cost per repository | Caching and conditional requests |
| Framework heroes (React, Laravel, Prisma…) | Not in Linguist data | Manifest scanning |
| Quest reroll tokens | Config-driven rerolls are awkward | Shop (P1-1) |
| Emblem talents | Depth after the base system proves out | Emblems (P1-2) |
| Prestige beyond level 100 | Far from current need | — |
| Night Owl and time-of-day medals | Commit local time is unreliable | — |
| Animated SVGs | Accessibility and size; cosmetic | Shop |
| Private repository detail via PAT | D-02 | Owner opt-in, privacy design |
| Public opt-in ladder | Multi-user | Aggregator service |
| Real squads with shared goals | Multi-user | Service and consent |
| Interactive world map, web dashboard | README cannot host interactivity | Web app |
| Issue-command shop | Moving parts and abuse surface | P1-1 proven |
| Reusable packaged GitHub Action for adopters | After the single-user version is stable | Config schema freeze |
