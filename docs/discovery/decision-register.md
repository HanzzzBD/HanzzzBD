# Decision Register — GitHub Legends

- **Date:** 2026-10-20
- **Status key:** `Open` (awaiting owner), `Proposed` (recommended default, adopt unless the owner objects), `Decided`.
- Decisions D-01 to D-04 materially affect the architecture. The owner confirmed the recommended default for all four on 2026-10-20.

| ID | Decision | Status |
| --- | --- | --- |
| D-01 | Product scope: single-user profile vs. multi-user platform | Decided |
| D-02 | Include private repository data? | Decided |
| D-03 | Naming and art: MLBB-branded vs. original "inspired by" | Decided |
| D-04 | Progress model: stateless recompute vs. persisted ledger | Decided |
| D-05 | Where generated assets and state live | Proposed |
| D-06 | Toolchain / language | Proposed |
| D-07 | Update cadence | Proposed |
| D-08 | README integration strategy | Proposed |
| D-09 | Timezone for daily/weekly boundaries | Proposed |
| D-10 | Existing third-party stat cards | Proposed |
| D-11 | Scoring and anti-farming policy | Proposed |
| D-12 | Season length | Proposed |
| D-13 | Battle Points: earn-only vs. spendable | Proposed |
| D-14 | Technology detection depth | Proposed |
| D-15 | Naming of game achievements vs. real achievements | Proposed |
| D-16 | World map interactivity | Proposed |

---

### D-01 — Product scope

- **Options:**
  1. Single-user profile system for `HanzzzBD`, static generation in Actions.
  2. Reusable generator (a GitHub Action or template) that any user can run in their own profile repository.
  3. Multi-user platform (web app, OAuth, database, leaderboards).
- **Trade-offs:** (1) is the fastest and needs no hosting, but it has no real leaderboards or squads. (2) adds config and packaging work but stays serverless. (3) unlocks every mechanic but adds hosting, auth, privacy and ops.
- **Recommended default:** (1) now, built as (2)-ready: a config-driven engine with no hard-coded username.
- **Decision (2026-10-20):** single-user, reusable. Static Actions generator, config-driven, no hosting.
- **Reasoning:** the repository is a personal profile with no infrastructure. Shipping visible value early reduces risk, and a pure scoring library keeps (3) open.

### D-02 — Private repository data

- **Options:**
  1. Public data only, using `GITHUB_TOKEN`.
  2. Public data plus the anonymous `restrictedContributionsCount`.
  3. Fine-grained PAT with read-only access to selected private repos, rendered **aggregated only**.
- **Trade-offs:** (1) and (2) need no secret but under-count private work. (3) is complete, but needs PAT creation and rotation and adds leak risk on a public profile.
- **Recommended default:** (2) for MVP; (3) as an opt-in later.
- **Decision (2026-10-20):** option (2). Public data plus the anonymous private contribution count; no PAT.
- **Reasoning:** safe by default, no secrets to manage at first, and still credits private work in totals if the owner enabled private contributions on their profile.

### D-03 — Naming and art

- **Options:**
  1. Use Mobile Legends names (ranks, heroes, "Battle Points", logos).
  2. Original names and art with MOBA-style mechanics ("inspired by").
  3. Generic names (Bronze/Silver/Gold).
- **Trade-offs:** (1) is the most recognisable but is trademark and copyright risk on a public page. (2) needs naming and design effort and is safe and distinctive. (3) is safe but bland.
- **Recommended default:** (2).
- **Decision (2026-10-20):** option (2). Original names and art with MOBA-style mechanics.
- **Reasoning:** keeps the theme without IP exposure. MLBB-style structures (tiered ranks with stars, roles, emblems) are mechanics, not protected names.

### D-04 — Progress model

- **Options:**
  1. Stateless: recompute everything from the API each run.
  2. Ledger: persist awarded items keyed by stable IDs; derived values come from the ledger.
- **Trade-offs:** (1) is simple, but progress can drop when data leaves API windows or repositories are deleted, and quest/season history is impossible. (2) gives monotonic, auditable progress, season snapshots and deduplication, at the cost of a state file and migration care.
- **Recommended default:** (2), with a rebuild-from-API command for recovery.
- **Decision (2026-10-20):** option (2). Persisted ledger with idempotent awards.
- **Reasoning:** seasons, quests, battle history and deduplication all need state.

### D-05 — Location of generated assets and state

- **Options:**
  1. `main` branch under `assets/legends/` and `data/legends/`.
  2. Dedicated branch (e.g. `legends-data`) for state and assets; README on `main` references them via absolute raw URLs.
  3. External storage (gist, release assets, object storage).
- **Trade-offs:** (1) is simplest and relative paths just work, but every update adds a bot commit to `main`. (2) keeps `main` clean, but needs absolute URLs, and the README must still change on `main` for text updates. (3) adds another service and token scopes.
- **Recommended default:** (1) with commit-only-on-change. Revisit (2) if commit noise bothers the owner.
- **Reasoning:** fewest moving parts. A deterministic renderer keeps no-op runs commit-free.

### D-06 — Toolchain

- **Options:** TypeScript on Node.js with `pnpm`; Python; a shell plus off-the-shelf actions.
- **Trade-offs:** TypeScript matches the owner's main stack (README lists TS, Node, pnpm), has strong GitHub SDKs (`@octokit/*`), and gives typed game rules. Python is fine but off-stack. Off-the-shelf actions cannot express custom mechanics.
- **Recommended default:** TypeScript + Node LTS + `pnpm`, with Vitest for tests and ESLint/Prettier for quality.
- **Reasoning:** maintainability by the owner, and good SVG templating options.

### D-07 — Update cadence

- **Options:** hourly; daily; on push only; manual.
- **Trade-offs:** hourly is fresh, but noisy and wasteful for quests that resolve daily. Daily matches the quest granularity. On push only misses activity in other repositories.
- **Recommended default:** daily at an off-minute after local midnight (e.g. 00:17 in UTC+7), plus `workflow_dispatch`.
- **Reasoning:** aligns with daily quests and keeps commits and API use low.

### D-08 — README integration

- **Options:** full regeneration from a template; marker-delimited injection; a separate generated file linked from the README.
- **Trade-offs:** a full template is clean but forces all hand-written content into a template file. Markers preserve the existing README with minimal disruption. A separate file is less visible.
- **Recommended default:** marker injection (`<!-- LEGENDS:START -->` / `<!-- LEGENDS:END -->`), failing safe when markers are missing or malformed.
- **Reasoning:** the owner's current README must not be overwritten.

### D-09 — Timezone

- **Options:** UTC; owner's local timezone.
- **Recommended default:** configurable, defaulting to `Asia/Jakarta` (UTC+7, inferred from commit metadata; owner to confirm).
- **Reasoning:** daily quests should reset at the owner's midnight. API day-boundary semantics need verification.

### D-10 — Existing third-party stat cards

- **Options:** keep; replace with self-generated equivalents; keep until replacements exist.
- **Recommended default:** keep until GitHub Legends cards ship, then let the owner choose.
- **Reasoning:** no regressions to the current profile during development.

### D-11 — Scoring and anti-farming

- **Options:** raw counts; weighted with caps and diminishing returns.
- **Recommended default:** weighted (e.g. release > merged PR to another owner's repo > review > merged own PR > issue > commit), with a daily commit EXP cap and no EXP for bot-authored or empty commits. Exact weights go in config.
- **Reasoning:** keeps the profile credible and rewards meaningful work.

### D-12 — Season length

- **Options:** monthly; quarterly; calendar-aligned (e.g. 3 months); yearly.
- **Recommended default:** quarterly, defined in config.
- **Reasoning:** long enough to climb ranks with one person's activity, short enough to feel seasonal.

### D-13 — Battle Points

- **Options:** earn-only score; spendable currency via config edits or issue commands; omit.
- **Trade-offs:** spending needs a shop, a ledger and an input channel (no UI on a README). Earn-only is simple.
- **Recommended default:** earn-only for MVP. Spending (e.g. unlocking cosmetic skins via a config change) later.
- **Reasoning:** spending without a UI is awkward and easy to get wrong.

### D-14 — Technology detection depth

- **Options:** languages only; languages + topics; plus manifest scanning; manual config.
- **Recommended default:** languages (Linguist) + repo topics + manual config overrides. Manifest scanning comes later.
- **Reasoning:** good accuracy for low API cost. Manifest scanning multiplies requests.

### D-15 — Achievement naming

- **Recommended default:** call computed game achievements "Medals" (or similar) and leave the existing "🏆 Achievements" competition table untouched.
- **Reasoning:** avoids confusing real awards with game badges.

### D-16 — World map interactivity

- **Options:** single static SVG; per-checkpoint linked tiles; external interactive web page.
- **Recommended default:** a single static SVG for MVP, linking to a details section or doc. An interactive version is deferred to a possible web app.
- **Reasoning:** README cannot host interactivity; tiles are layout-fragile across screen sizes.
