# Feasibility Analysis — GitHub Legends

- **Date:** 2026-10-20
- **Scope:** which game mechanics can be computed from GitHub data, which need custom data or configuration, and which need extra services.
- **Status:** discovery. API behaviour below comes from GitHub's documented behaviour as known at the time of writing. Items marked **[verify]** must be confirmed with a spike against the live API before the design depends on them.

## 1. Classification legend

| Code | Meaning |
| --- | --- |
| **G** | Derivable from GitHub data alone |
| **G+S** | Derivable from GitHub data, but needs **persisted state** between runs (history, deduplication, "spent" currency) |
| **C** | Needs **custom data or manual configuration** (a config file in the repo) |
| **X** | Needs an **external service or separate web application** |

## 2. GitHub data sources

No single endpoint covers all activity. The collector will combine several sources:

| Data | Primary source | Secondary source | Notes |
| --- | --- | --- | --- |
| Contribution totals and calendar | GraphQL `user.contributionsCollection(from, to)` | — | Window of at most **1 year** per query; loop over years for lifetime data. Includes `contributionCalendar`, `totalCommitContributions`, `totalPullRequestContributions`, `totalIssueContributions`, `totalPullRequestReviewContributions`, `restrictedContributionsCount`. |
| Commits per repository | GraphQL `commitContributionsByRepository` | REST `GET /repos/{o}/{r}/commits?author=` | GraphQL is capped at 100 repositories per window. REST gives individual SHAs, which deduplication needs. |
| Pull requests | GraphQL `pullRequestContributions` / `search(type: ISSUE, query: "author:X is:pr")` | REST `GET /repos/{o}/{r}/pulls` | Search is capped at 1,000 results per query and has a separate rate limit. |
| PR reviews | GraphQL `pullRequestReviewContributions` | REST reviews per PR | |
| Issues | GraphQL `issueContributions` / search | REST `GET /repos/{o}/{r}/issues` | The REST issues endpoint also returns PRs; filter them out with the `pull_request` key. |
| Releases | REST `GET /repos/{o}/{r}/releases` per repository | GraphQL `repository.releases` | Per repository; there is no user-wide release feed. Releases are not contributions on the graph. |
| Workflow runs | REST `GET /repos/{o}/{r}/actions/runs` per repository | — | Per repository. Needs `actions:read` on each repository. |
| Language statistics | REST `GET /repos/{o}/{r}/languages` (bytes per language, Linguist) | GraphQL `repository.languages` | **Repository-level bytes, not authored lines.** |
| Repositories owned / contributed to | GraphQL `user.repositories`, `repositoriesContributedTo` | REST `GET /user/repos` | `repositoriesContributedTo` covers recent contributions only **[verify window]**. |
| Recent event stream | REST `GET /users/{u}/events` | — | **At most 300 events and only the last 90 days**, delivered with a delay. Not usable as the system of record. |
| Collaborators / co-authors | Commit message trailers (`Co-authored-by:`), PR reviewers, repo collaborators | — | Needs commit messages, so per-commit fetches. |

## 3. Investigation of specific data concerns

### 3.1 Commit attribution

- A commit counts for a user only when its **author email is linked to (and verified on) the account**. Commits from an unlinked machine email are invisible to user-level queries even though they exist in the repository. The audited repo uses `noreply` addresses, which are attributed correctly.
- The contribution graph counts commits only when they are on the **default branch** (or `gh-pages`) of a **non-fork** repository. Commits on feature branches count only after being merged. Commits in forks count only once merged upstream.
- `Co-authored-by:` trailers grant the contribution to co-authors on the graph. A REST author filter does **not** return co-authored commits, so co-authorship needs message parsing.
- Commits authored by `github-actions[bot]` (for example the generator's own README updates) are **not** user contributions. The engine must exclude bot authors so automation does not award EXP to itself.
- **Rebases, amends and cherry-picks create new SHAs** for the same work, and force-pushes remove SHAs. Squash merges turn N branch commits into 1 default-branch commit. Counting raw SHAs over time can double count or undercount.
- **Decision:** use GraphQL contribution totals as the authoritative "official" count. Use SHA-level data only where per-item detail is needed (battle history, deduplication), and accept that the two will not reconcile exactly.

### 3.2 Contribution data

- `contributionsCollection` is the best single source for the profile-level metrics behind EXP, levels, streaks and quests.
- Span limit: `from`/`to` at most 1 year apart. Lifetime totals mean one query per year since account creation; cache past years, because they are immutable except for late-merged or newly linked work.
- `contributionCalendar` gives per-day counts, which are enough for daily and weekly quests and streaks. **[verify]** which timezone the API uses for day boundaries; the owner appears to be in UTC+7, and a mismatch shifts "today".
- Private work appears only as `restrictedContributionsCount` (a number with no detail), and only if the owner enabled **"Include private contributions on my profile"**.

### 3.3 Pull requests

- Feasible (**G**): opened, merged, closed-unmerged, reviewed, review comments, time-to-merge, additions/deletions.
- A PR maps naturally to a **"battle"**: merged counts as a win, closed unmerged as a loss or retreat, and reviews as assists. All of this is derivable. The framing is a product decision.
- PRs to the owner's own repositories with no reviewer are trivially "winnable". Scoring should weight PRs to other people's repositories or reviewed PRs higher, or cap self-merged PRs.

### 3.4 Issues

- Feasible (**G**): opened, closed, closed-as-completed versus not-planned (`state_reason`), comments.
- Issue comments are not on the contribution graph. They need per-repository or search queries, which cost more requests.

### 3.5 Releases

- Feasible per repository (**G**). There is no user-level release query, so the collector iterates over owned repositories.
- Releases are a good "objective / boss" event: rare, meaningful, and hard to farm without effort (although an empty release is still possible).

### 3.6 GitHub Actions workflow runs

- Feasible per repository (**G**) with `actions:read`. Useful for "equipment durability" or "battle conditions" (CI pass rate, fix-the-build quests).
- **Retention:** run logs and artifacts are kept for 90 days by default. Run metadata stays listable longer, but this repository must not rely on old logs. **[verify]** whether run metadata for deleted workflows remains listable.
- The generator's own workflow runs must be excluded from scoring.

### 3.7 Repository language statistics

- Linguist bytes per language per repository (**G**). It measures **repository composition, not personal authorship**: a large vendored or generated file inflates a language, and forks or co-owned repositories credit languages the owner barely touched.
- Usable heuristics:
  - weight by the owner's commit share in each repository (needs per-repo commit counts);
  - exclude forks and archived repositories, or weight them lower;
  - optionally map file extensions in the owner's commits (expensive: per-commit file lists).
- Technology mastery beyond languages (React, Laravel, Docker, Prisma) is **not** in language stats. It needs repository topics, manifest detection (`package.json` dependencies, `composer.json`, `Dockerfile`, workflow files) through the contents/tree API (extra requests per repository), or manual configuration (**C**).

### 3.8 Public and private repository access

| Token | Public repos (any owner) | Owner's private repos | Notes |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` (Actions) | Read via API (public data) | **Only the current repository** | Cannot read the owner's other private repositories. GraphQL `contributionsCollection` returns public data plus `restrictedContributionsCount`. |
| Fine-grained PAT (stored as an Actions secret) | Yes | Yes, for selected repositories, with read-only `contents`, `metadata`, `pull_requests`, `issues`, `actions` | Has an expiry, so rotation is needed. The best least-privilege option for one user. |
| Classic PAT with `repo` | Yes | Yes, full read/write | Over-privileged. Not recommended. |
| GitHub App (installed on the account) | Yes | Repositories where installed | Auto-rotating installation tokens. Heavier setup, and the right choice if this becomes multi-user. |

**Privacy risk:** this repository is public, so anything the generator renders (repository names, PR titles, language mix of private repositories) becomes public. Private data must be aggregated or anonymised before rendering, or excluded.

### 3.9 API rate limits

| Limit | Value (documented defaults) | Impact |
| --- | --- | --- |
| REST, `GITHUB_TOKEN` | 1,000 requests/hour per repository | Enough for one user with tens of repositories if requests are batched |
| REST, PAT | 5,000 requests/hour | Comfortable for one user |
| GraphQL | 5,000 points/hour (PAT); node limits per query | `contributionsCollection` is cheap; large nested queries are not |
| Search API | 30 requests/minute (authenticated) | Avoid search in hot paths |
| Secondary limits | Concurrency and per-minute content limits | Send requests one at a time with backoff; honour `Retry-After` |
| Unauthenticated | 60 requests/hour | Not viable |

**Estimate for one user:** about 1 GraphQL call per year of history, plus about 4 to 6 REST calls per repository (languages, releases, runs, pulls/issues pages). With 30 repositories that is about 200 requests per full run. With incremental fetching (`since`, ETags / conditional requests, which do not count against the limit when they return 304) a daily run is comfortably within limits. **Not feasible without an aggregator service:** leaderboards over many users.

### 3.10 Data retention

| Source | Retention / window |
| --- | --- |
| Events API | 90 days, at most 300 events |
| Contribution calendar | Back to account creation, in 1-year windows |
| Actions logs and artifacts | 90 days by default |
| Repository traffic (views/clones) | 14 days, needs push access |
| Deleted repositories | Their contributions disappear from the API |

**Consequence:** history the API drops (old events, deleted repositories, rebased commits) must be **snapshotted into persisted state** if seasons and battle history are to stay stable. Otherwise levels can go *down* when a repository is deleted. Product decision: should progress be monotonic (ledger-based) or recomputed (stateless)? See the decision register.

### 3.11 Duplicate event processing

Sources of duplicates:

- the same activity seen through several endpoints (a PR in both search and per-repo lists; a commit in the default branch and in a PR);
- overlapping time windows across scheduled runs;
- retries after partial failures;
- manual reruns (`workflow_dispatch`) and concurrent runs.

Mitigations:

1. **Idempotency keys** per item: commit SHA, PR/issue GraphQL `node_id`, release `id`, workflow run `id`, plus a stable `source` prefix.
2. **Award ledger** (append-only JSON or NDJSON) recording `{key, rule, exp, awardedAt}`. A key is awarded at most once per rule.
3. **Watermarks** (`lastProcessedAt` per source) with an overlap margin, deduplicated by key.
4. **Workflow `concurrency` group** so two generator runs never interleave.
5. **Deterministic recomputation** as a fallback: derived values (level, rank) are always recomputed from the ledger, never incremented in place.

## 4. Mechanic-by-mechanic feasibility

| Mechanic | Class | Data / approach | Notes and risks |
| --- | --- | --- | --- |
| **Player profile** | G + C | User API (name, avatar, created date, followers) plus config (title, display name, chosen role) | Avatar must be embedded as a data URI in SVG (external images do not load inside SVG served as an image) |
| **EXP and levels** | G (stateless) or G+S (ledger) | Weighted contributions: commits, PRs, reviews, issues, releases | Needs anti-farming (daily caps, diminishing returns). Level curve is a design choice. |
| **Rank progression** | G+S | Season-scoped points on an ordered tier ladder | Original tier names recommended (trademark, §6). Demotion needs per-season state. |
| **Battle Points (currency)** | G (earned), **G+S/C (spent)** | Earned from activity. Spending needs a ledger plus a config-driven "shop" | With no UI, "buying" happens through edits to a config file or issue commands. Consider earn-only BP. |
| **Hero collection** | G + C | Heroes map to languages/technologies. Unlocked when thresholds are met (bytes, repos, commits) | The hero roster and art must be original. Mapping config needed. |
| **Technology mastery** | G (languages), C / G-expensive (frameworks) | Linguist bytes weighted by commit share. Topics and manifests for frameworks | Accuracy limits as in §3.7 |
| **Emblems / specialization** | G + C | Derived from activity shape (reviewer, releaser, polyglot, CI) or chosen in config | Owner choice keeps it meaningful; derived values are suggestions |
| **Equipment (dev tools)** | C (primary), G (detect) | Config list, optionally auto-detected from repo files (Dockerfile, workflows, lockfiles) | Detection costs tree/contents requests per repository |
| **Daily / weekly quests** | G+S | Contribution calendar per day. Quest definitions in config. Completion log in state | Timezone boundary [verify]. "Daily" refresh needs at least daily runs. |
| **Achievements** | G (+S for "first time" dating) | Rule-based badges (first release, 100 PRs, 30-day streak) | Keep separate from the README's real-world "Achievements" table |
| **Season progression** | G+S + C | Season calendar in config. Season snapshots persisted at rollover | Rollover must be idempotent |
| **Squad / collaboration** | G (partial), **X** (full) | Co-authors, PR reviewers, collaborators on shared repos | A real squad with other users' progress needs their data and consent → service |
| **Battle history** | G+S | PRs/releases as matches, persisted beyond the 90-day windows | Rendered list must avoid leaking private titles |
| **Leaderboards** | **X** | Needs many users' scores | Single-user alternative: personal records and "vs last season". A real leaderboard needs an opt-in aggregator (separate repo or service). |
| **World map with checkpoints** | G (static SVG) | Level/achievements unlock checkpoints in a generated SVG | No clickable regions inside an `<img>`; interactivity needs a web app (**X**) or separate linked images |
| **Auto-generated profile README** | G | Actions job injects generated sections between markers and commits | Must preserve hand-written content |

## 5. Architecture options

| Option | Description | Fits | Costs |
| --- | --- | --- | --- |
| **A. Actions-only static generator** (recommended for MVP) | Scheduled workflow: collect → score → render SVGs → inject README → commit. State in a JSON file on a dedicated data branch or folder. | Every single-user mechanic in §4 except true leaderboards, multi-user squads and interactive map | No hosting. Bound by Actions schedule (minimum 5 min, best-effort) and README rendering limits. |
| **B. A + dynamic image service** | Serverless function (e.g. Vercel) renders SVG on request | Fresher data, shareable cards for other users | Hosting, token on a server, caching (GitHub's image proxy caches anyway) |
| **C. Full web app + database** | Multi-user platform with OAuth, DB, leaderboards, interactive map | Leaderboards, squads, interactivity | Much larger scope: auth, privacy, ops |

Recommended path: **A first**, designed so that the scoring engine is a pure library (input: normalised activity; output: game state) that B or C can reuse later.

## 6. Non-API feasibility notes

- **IP / trademark:** "Mobile Legends: Bang Bang", its hero names, rank names as a set (Warrior → Mythical Glory), "Battle Points" as branded currency, logos and art belong to Moonton. Using them verbatim in a public profile is legal risk and may also break GitHub's terms on infringing content. Recommendation: mechanics *inspired by* MOBA progression, with original names and art. Final call is in the decision register.
- **Fairness and anti-gaming:** activity metrics are easy to farm (empty commits, self-merged PRs). Since this is a personal profile, the risk is reputational (the profile looks inflated) rather than competitive. Caps keep it credible.
