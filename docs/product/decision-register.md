# GitHub Legends — Product Decision Register

- **Version:** 0.1 · **Date:** 2026-10-20
- Product-level decisions for Phase 01. Architecture decisions D-01 to D-16 are in `docs/discovery/decision-register.md`. D-01 to D-04 constrain everything here.
- **Status:** `Decided` (confirmed by the owner) · `Proposed` (recommended default, adopted unless the owner objects) · `Open` (needs input before the phase noted).

| ID | Decision | Status |
| --- | --- | --- |
| P-01 | How Battle Points are spent | Decided |
| P-02 | What a hero is | Decided |
| P-03 | Meaning of leaderboards in single-user scope | Decided |
| P-04 | Rank behaviour across seasons and inactivity | Decided |
| PD-01 | Original naming scheme (tiers, world, currency) | Decided |
| PD-02 | EXP values and caps | Proposed |
| PD-03 | Level curve | Proposed |
| PD-04 | Season length and calendar | Proposed (D-12) |
| PD-05 | Timezone and week start | Decided |
| PD-06 | What counts as a "battle" | Proposed |
| PD-07 | What BP can buy | Proposed |
| PD-08 | Hero roster and role mapping | Proposed |
| PD-09 | Technology and equipment detection depth | Proposed (D-14) |
| PD-10 | Backfill policy | Proposed |
| PD-11 | Quests reward BP only | Proposed |
| PD-12 | Effective-date rule against backdating | Proposed |
| PD-13 | Ruleset changes: prospective by default | Proposed |
| PD-14 | Showing other people (allies) | Proposed |
| PD-15 | Name for game achievements | Proposed (D-15) |
| PD-16 | Art direction and asset production | Decided |
| PD-17 | Rank protection package (trials, weekly cap, −3 reset) | Decided |
| PD-18 | Commit EXP curve and automation detection | Decided |
| PD-19 | Emblem model: seven domain emblems | Decided |
| PD-20 | Award that crosses a daily cap: partial or zero | Open (engine uses partial) |
| PD-21 | Season-end reward for a season with no activity | Open (engine pays 100 BP) |

---

### P-01 — Spending Battle Points

- **Options:** config-file purchases · issue-command shop · earn-only in MVP.
- **Trade-offs:** config purchases are auditable and need no extra workflow trigger, but they are less immersive. Issue commands feel more like a game, but they add a trigger surface, permissions and abuse risk. Earn-only delays the economy.
- **Decision (2026-10-20):** **config-file purchases** with requestId idempotency, validated against the ledger (PRD §6.4).
- **Reasoning:** fits the static architecture, and every transaction is reviewable in git history.

### P-02 — Hero model

- **Options:** original character per technology · technology itself as the hero.
- **Trade-offs:** characters add flavour and collectability but need a roster and art. The technology-as-hero model is simpler but feels less like a game.
- **Decision (2026-10-20):** **original character bound to one technology** (PRD §6.5).
- **Reasoning:** delivers the "hero collection" feel while staying honest: the bound technology is always shown.

### P-03 — Leaderboards

- **Options:** personal records · defer · opt-in public ladder later.
- **Decision (2026-10-20):** **personal records**, plus season and hero ladders (PRD §6.14). A public ladder is listed as deferred.
- **Reasoning:** respects single-user scope (D-01) and never needs other users' data.

### P-04 — Rank decay

- **Options:** soft reset with no demotion · demotion with protection.
- **Decision (2026-10-20):** **soft reset of 2 tiers per season, no demotion, inactivity never costs rank** (PRD §6.3, §6.11).
- **Reasoning:** encourages consistency without punishing breaks (exams, holidays), which matters for a student player.

### PD-01 — Original naming scheme

- **Options:** MLBB names (rejected by D-03) · generic metals · original fantasy names.
- **Recommended default:** tiers Initiate → Squire → Knight → Warden → Champion → Paragon → Ascendant → Eternal; world "The Realms"; currency keeps the descriptive name "Battle Points" (generic term). Medals instead of Achievements.
- **Trade-offs:** "Battle Points" is also the MLBB currency name. It is a generic phrase, and the project brief uses it, but if the owner wants zero overlap, rename it (for example "Glory").
- **Reasoning:** readable to visitors, no trademark exposure.
- **Decision (2026-10-20):** tier and world names as recommended; the currency keeps the name **Battle Points**.

### PD-02 — EXP values and caps

- **Recommended default:** PRD §4.3 table (commit 10, daily cap 100; PR 30/60; review 25; issue 10/15; release 50/20; private 4 per contribution, 200 per week).
- **Trade-offs:** higher commit weight rewards steady work but is easier to farm. Weighting integration, review and release higher rewards collaboration and shipping.
- **Reasoning:** caps bound any single day while rewarding meaningful work. Values sit in the versioned ruleset and can be tuned after the first season (PD-13).

### PD-03 — Level curve

- **Recommended default:** `100 + 50(n−1)` EXP per level, cap 100 with overflow.
- **Reasoning:** early levels come quickly (onboarding), and level 30 needs about a year of steady activity (23,200 EXP).

### PD-04 — Season length

- **Recommended default:** quarterly, aligned to calendar quarters in the player's timezone. Season 1 = the install quarter.
- **Reasoning:** about 91 days fits the star ladder calibration (PRD §6.3).

### PD-05 — Timezone and week start

- **Recommended default:** `Asia/Jakarta` (inferred from commit metadata, **owner to confirm**); ISO weeks starting Monday.
- **Reasoning:** quests and battles must reset at the player's local midnight.
- **Decision (2026-10-20):** `Asia/Jakarta`, ISO weeks starting Monday.

### PD-06 — Battle definition

- **Options:** each PR as a battle · each player day as a battle.
- **Recommended default:** **one battle per active day**, scored from capped EXP; PRs and releases are objectives within it.
- **Reasoning:** works for solo developers who push directly to the default branch, caps stars at 2 a day, and avoids negative "defeats".

### PD-07 — BP catalog

- **Recommended default:** cosmetics (frames, titles, hero skins, map themes), emblem set unlocks, and one extra equipment slot. **Never** EXP, stars, mastery, medals or heroes.
- **Reasoning:** BP stays a reward currency without letting currency buy claims about activity or expertise.

### PD-08 — Hero roster

- **Recommended default:** v1 catalog of about 15 language heroes over six roles (Mage frontend, Fighter backend, Marksman data/AI, Assassin systems, Tank infra, Support tooling/game tech), prioritising the owner's languages: TypeScript, JavaScript, Python, PHP, C#, HTML, CSS, Shell, plus common others. Names and lore are written in Phase 02 design.
- **Reasoning:** covers the owner's actual stack on day one.

### PD-09 — Detection depth

- **Recommended default:** MVP uses Linguist languages only. P1 adds GitHub Actions and repository topics. P2 adds marker-file and manifest scanning (frameworks and tools).
- **Reasoning:** API cost (feasibility §3.7).

### PD-10 — Backfill policy

- **Recommended default:** lifetime systems from full history; Season 1 battles and stars from the install quarter only; milestone BP granted for backfill; activity BP before Season 1 not granted.
- **Trade-offs:** granting all historical activity BP would flood the economy. Granting none would leave the shop empty at launch.
- **Reasoning:** a fair starting point that keeps the economy balanced.

### PD-11 — Quest rewards

- **Recommended default:** BP only (STK-5).
- **Reasoning:** quests count already-rewarded activity, so EXP would double-reward it.

### PD-12 — Backdating defence

- **Recommended default:** periodic systems use effective date = max(event date, firstSeenAt − 48 h); periods close 48 h after they end.
- **Reasoning:** git dates can be forged; this stops retroactive quest and streak completion without penalising normal pushes made a day later.

### PD-13 — Ruleset changes

- **Recommended default:** prospective; full rebuild only as an explicit, confirmed maintenance action with a diff report.
- **Reasoning:** progress never silently changes.

### PD-14 — Allies

- **Recommended default:** show logins only (no avatars, no stats), public interactions only, with a hide list and an off switch.
- **Reasoning:** collaboration is shown while respecting other people.

### PD-15 — Achievement naming

- **Recommended default:** "Medals". The README's hand-written "🏆 Achievements" table stays untouched.

### PD-16 — Art direction (Open)

- **Options:** hand-drawn or commissioned original art · AI-assisted original art (licensing and policy review needed) · iconographic or geometric style generated in code.
- **Trade-offs:** art quality versus cost, time, licensing and SVG size budgets (< 100 KB per SVG).
- **Recommended default:** **iconographic, code-generated SVG** (role glyphs, frames, gradients) for MVP, with optional original illustrations later.
- **Reasoning:** zero licensing risk, small files, deterministic output.
- **Decision (2026-10-20):** code-generated iconographic SVG for v1.

### PD-17 — Rank protection package

- **Context:** the Phase 02 economy model showed that, under PRD values, 3–4 scripted tiny commits a day reach Ascendant in Season 1 and Eternal by Season 2.
- **Options:** full package · weekly cap and trials with a −2 reset · weekly cap only.
- **Decision (2026-10-20):** **full package.** Promotion trials gate Champion, Paragon, Ascendant and Eternal on verified objectives (some contested, involving another human); 5 stars per ISO week; soft reset −3 tiers; MVP needs score ≥ 100 plus a contested objective.
- **Reasoning:** in the model, scripted activity is capped at Warden I, while consistent real collaborators reach Paragon in Season 1. See `docs/game-design/economy-balancing.md` §4.

### PD-18 — Commit EXP and automation detection

- **Options:** diminishing returns with detection · diminishing returns only · PRD flat values.
- **Decision (2026-10-20):** **diminishing returns with detection.** Commits 1–5 earn 10, commits 6–10 earn 5, and the rest earn 0 (75 per day). Clockwork and micro-flood heuristics flag repos, which then earn 0 until the pattern stops. Self-merged unreviewed PRs earn 15 (max 2 per day).
- **Reasoning:** limits lifetime EXP farming. Flags never revoke past awards and clear automatically.

### PD-19 — Emblem model

- **Options:** domain emblems from verified evidence · domain emblems with playstyle talents · self-chosen cosmetic emblems.
- **Decision (2026-10-20):** **seven domain emblems** (Frontend, Backend, Full-stack, AI/ML, DevOps, Database, Open Source), levelled from verified domain evidence; one active at a time, with a BP bonus and a specialty quest. Replaces the PRD's activity emblems.
- **Reasoning:** matches the owner's brief while keeping the mechanics evidence-based.

### PD-20 — Award that crosses a daily cap (Open)

- **Context:** PRD §4.3 says an activity "above the cap" gets a zero-EXP entry; the economy model (GDD economy §4) computed `min(sum, cap)`, which gives the crossing award the remainder.
- **Options:** (a) partial remainder (current engine, matches the simulated numbers) · (b) all-or-nothing (the crossing award gets 0).
- **Recommended default:** (a), because the published balancing numbers were produced with it.
- **Impact:** at most one partial award per capped rule per day (the difference is below one award: < 60 EXP for PRs, < 50 for releases, < 25 for reviews, < 15 for issues); it only affects stars when it moves the day across a battle threshold.

### PD-21 — Season-end reward for an empty season (Open)

- **Context:** tables §2.3 pay 100 BP for an Initiate peak. A season with no activity at all also ends at Initiate.
- **Options:** (a) pay 100 BP as written (current engine) · (b) require at least one battle in the season.
- **Recommended default:** (b), so BP is not granted for inactivity, but this changes an approved table and needs the owner.
