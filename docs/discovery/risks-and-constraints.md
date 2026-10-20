# Risks and Constraints — GitHub Legends

- **Date:** 2026-10-20
- Items marked **[verify]** are documented or widely observed behaviour that should be confirmed in a spike before the design depends on it.

## 1. Capability boundaries

| Layer | What it can do | What it cannot do |
| --- | --- | --- |
| **Native GitHub** (profile README rendering) | Render sanitised Markdown/HTML, images, links, tables, `<details>`, `<picture>` with `prefers-color-scheme` sources, emoji, relative links to files in the repo | Run JavaScript; use `<style>`, `<script>`, `<iframe>`, forms, image maps, or most inline `style` attributes; update itself |
| **Generated static assets** (SVG/PNG committed by Actions) | Show any visual: cards, progress bars, maps, animated SVG (CSS/SMIL animation inside the SVG) | React to the viewer, hold per-view state, load external fonts or images from inside the SVG, run scripts |
| **External services** (third-party or self-hosted image endpoints) | Render on request with fresher data | Avoid GitHub's image proxy cache; avoid outages and rate limits of shared instances |
| **Separate web application** | Interactivity, multi-user data, leaderboards, OAuth, clickable world map, quest UI | Live inside the README (it can only be *linked* from it) |

## 2. GitHub Profile README constraints

- **Repository requirements:** the repository must be public and named exactly after the user (`HanzzzBD/HanzzzBD`), and `README.md` must sit at the root (or in `.github/`). Satisfied today. Making the repo private hides the profile README.
- **HTML sanitisation:** GitHub strips scripts, styles, event handlers, iframes, forms, `<map>`/`<area>`, and most attributes. Allowed layout tools are limited to `align`, `width`/`height` on images, tables, `<p>`, `<div>`, `<details>`/`<summary>`, `<picture>`/`<source>`, `<sub>`/`<sup>`, `<kbd>`.
- **No interactivity:** the only interaction is following a link. Each clickable element (for example each world-map checkpoint) must be a separate linked image, or the map links out to a web page.
- **Image proxy caching (Camo):** external images are proxied and cached. Updates can take minutes or more to appear unless the URL changes or cache headers are short. Images committed to the repository and referenced by relative path are served from the repository and refresh when the commit lands (browser cache aside).
- **Size:** keep README and asset sizes small; very large rendered files may be truncated, and heavy SVGs slow page load. **[verify]** current truncation threshold. Target: README < 50 KB, each SVG < 100 KB, total generated assets < 1 MB.
- **Dark/light mode:** use `<picture>` with `prefers-color-scheme` sources, or SVGs designed to read on both backgrounds.
- **Accessibility:** every image needs meaningful `alt` text. A text summary (level, rank) in the Markdown itself keeps information available to screen readers and to clients that block images.
- **Content coexistence:** the current README is hand-written. The generator may only replace content between markers such as `<!-- LEGENDS:START -->` / `<!-- LEGENDS:END -->` and must fail safe (no write) if markers are missing or duplicated.

## 3. SVG rendering constraints

When GitHub shows an SVG through `<img>` (which is how README images render):

- **No scripts**: JavaScript inside the SVG does not run.
- **No external resources**: `<image href="https://…">`, `@import`, and web fonts from URLs do not load. Avatars, icons and fonts must be **embedded** (base64 data URIs, inline paths) or replaced by system font stacks.
- **No `<foreignObject>` HTML reliability**: avoid it; behaviour varies across browsers.
- **CSS and SMIL animations work** in modern browsers. Respect `prefers-reduced-motion` inside the SVG's `<style>` and keep animation subtle (looping animation on a profile can be distracting).
- **Fonts**: use a system font stack, or subset and embed a font (adds size and needs a licence that allows embedding).
- **Text sizing**: SVG text does not wrap; the renderer must measure or truncate long strings (repository names, titles).
- **Security**: never interpolate unescaped user-controlled strings (repo names, PR titles, config values) into SVG/XML; escape `& < > " '`.
- **Determinism**: same input should produce byte-identical SVG, so unchanged runs produce no commit.

## 4. GitHub Actions constraints

- **Permissions:** set `permissions:` explicitly, with `contents: write` only for the job that commits. Everything else is read-only. `GITHUB_TOKEN` cannot read the owner's other private repositories.
- **Token for private data:** needs a fine-grained PAT (or GitHub App) stored as a secret. PATs expire, so the workflow must fail loudly (not silently produce zeros) when the token is invalid, and the owner needs a rotation reminder.
- **Scheduled workflows:**
  - minimum interval 5 minutes; runs are **best effort** and often delayed at busy times such as the top of the hour (use an off-minute cron);
  - schedules run only on the **default branch**;
  - in public repositories, scheduled workflows are **disabled after 60 days without repository activity**. **[verify]** whether commits made by the workflow itself count as activity; plan for a re-enable path and a status indicator.
- **Commits by `GITHUB_TOKEN` do not trigger further workflows** (except `workflow_dispatch` / `repository_dispatch`). That prevents loops, and also means a follow-up workflow will not fire on the generator's commit.
- **Concurrency:** use a `concurrency` group so overlapping scheduled and manual runs cannot interleave commits.
- **Commit noise:** a daily bot commit adds about 365 commits a year to `main`. Options: commit only when output changes; keep assets on a separate branch; or squash-amend a single generated commit on a data branch (never rewrite `main`).
- **Usage minutes:** public repositories get free standard-runner minutes. A run of a few minutes a day is negligible.
- **Branch protection:** if `main` becomes protected, the bot push needs an allowance or a different target branch.
- **Secrets hygiene:** never echo token values; mask derived values; do not pass secrets to steps that do not need them; pin third-party actions to commit SHAs.

## 5. Data and correctness risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Commits not attributed (unlinked emails) | Medium | Under-counted EXP | Document requirement; show "unattributed" diagnostics in logs only |
| Double counting after rebases, squashes, reruns | High | Inflated EXP | Ledger with idempotency keys; prefer GraphQL totals for headline numbers |
| Levels dropping when a repo is deleted or made private | Medium | Confusing regressions | Ledger-based monotonic EXP, or accept and document recompute semantics |
| Language stats misrepresent skill (vendored code, forks) | High | Misleading mastery | Exclude forks/archived repos, `linguist-vendored`, weight by commit share |
| Timezone mismatch on daily quests and streaks | Medium | Quests resolve on the wrong day | Configurable timezone (default likely `Asia/Jakarta`); [verify] API day boundary |
| Private data leaking into a public README | Medium | Privacy breach | Aggregate-only rendering for private sources; allowlist repos shown by name |
| Activity farming | Low (single user) | Credibility | Daily caps, diminishing returns, weight reviewed/merged work |
| API rate limits or secondary limits | Low (single user) | Failed run | Sequential requests, backoff, conditional requests, caches |
| API schema/behaviour changes | Low–Medium | Broken collector | Isolate API access behind adapters; contract tests with recorded fixtures |
| Third-party stat services outage | Medium (already in use) | Broken images | Replace with self-generated SVGs over time |

## 6. Product, legal and maintenance risks

- **Trademark / copyright:** using Mobile Legends names, hero names, rank names, logos or art in a public profile is risky. Use original names and art, with mechanics *inspired by* MOBA progression. (Decision D-03.)
- **Scope creep:** the full vision (squads, leaderboards, interactive map) needs a web application. An MVP should ship value with static generation only.
- **Maintenance burden:** token rotation, API changes, workflow disablement. Needs a health badge or failure notification.
- **Visual clutter:** the README is already long. Generated sections should be compact (one hero card plus collapsible details) rather than duplicating existing stats.
- **Owner-curated achievements:** the existing "Achievements" table lists real competition placements. Game achievements need a distinct name (e.g. "Medals" or "Feats") to avoid confusion.

## 7. Constraints summary for architecture

1. The README is a **static render target**; all dynamism happens at generation time.
2. SVGs must be **self-contained** (embedded fonts and images, no scripts).
3. Private data needs a **PAT or GitHub App**, plus **aggregation before rendering**.
4. Stable progress across API retention windows needs **persisted state** with **idempotent awards**.
5. Leaderboards, real squads and an interactive map need a **separate service**, outside MVP scope.
