# GitHub Legends — System Architecture

- **Version:** 0.1 (Phase 04) · **Date:** 2026-10-20
- **Inputs:** discovery, product (PRD, acceptance criteria), game design (GDD and tables), design (UX docs)
- **Companion docs:** `data-flow.md`, `data-model.md`, `security-model.md`, `testing-strategy.md`, `adr/`
- **Status:** architecture for review. Nothing is implemented yet.

## 1. Decisions in force

| Ref | Decision | ADR |
| --- | --- | --- |
| A-01 | **GitHub Actions with persisted state in the repository**; no database or external service | ADR-0001 |
| A-02 | Code lives in this profile repo under `legends/` (owner decision, 2026-10-20) | ADR-0002 |
| A-03 | `GITHUB_TOKEN` first; fallback is a fine-grained PAT with no repository permissions (owner decision) | ADR-0003 |
| A-04 | State on `main`, committed atomically with README and assets (owner decision) | ADR-0004 |
| A-05 | Pure, deterministic engine with an injected clock | ADR-0005 |
| A-06 | Idempotency keys and append-only cap allocation | ADR-0006 |
| A-07 | TypeScript on Node 24 LTS (native type stripping), pnpm, minimal dependencies | ADR-0007 |
| A-08 | Two-job workflow: read-only build, write-only publish with a path allow-list | ADR-0008 |
| A-09 | Data minimisation and privacy redaction | ADR-0009 |
| A-10 | Typed, escaping SVG/Markdown builders; no raw string templates with data | ADR-0010 |
| A-11 | Ruleset as versioned, schema-validated data | ADR-0011 |
| A-12 | Hybrid GraphQL/REST collection, incremental watermarks, resumable backfill | ADR-0012 |
| A-13 | Fixture-based testing; no live API in CI | ADR-0013 |

## 2. Option evaluation

| Criterion | 1. Actions only (stateless) | **2. Actions + persisted state (chosen)** | 3. External DB or service |
| --- | --- | --- | --- |
| Monotonic progress (D-04) | ✖ recompute drops data past API windows | ✔ ledger | ✔ |
| Idempotent awards, dedupe | ✖ only within one run | ✔ ledger index | ✔ |
| Seasons, quests, battle history | ✖ need history | ✔ | ✔ |
| Effective dates (`firstSeenAt`) | ✖ impossible | ✔ | ✔ |
| Hosting, cost, ops | none | none | server, DB, backups, uptime |
| Secrets | none (GITHUB_TOKEN) | none (GITHUB_TOKEN) | DB credentials, API keys |
| Auditability | — | ✔ git history of the ledger | needs custom audit |
| Multi-user features (deferred) | ✖ | ✖ | ✔ |
| Reproducibility | ✔ (but lossy) | ✔ (ledger + events + ruleset) | depends |

**Choice: option 2.** Option 1 cannot satisfy the ledger requirements (D-04, PRD §4.4, §7.1). Option 3 is only justified by multi-user features, which are deferred (D-01). The data volume (a few MB per year) fits comfortably in git. The design keeps the engine free of I/O, so option 3 remains possible later without rewriting game logic.

## 3. Context

```
                     ┌───────────────────────────────── GitHub ──────────────────────────────────┐
                     │                                                                            │
  GitHub API  ◄──────┤  Actions runner (scheduled daily / manual)                                 │
  (GraphQL + REST)   │   ├─ job build   (contents: read, GITHUB_TOKEN)                            │
                     │   │    collect → normalize → engine → derive → render → validate           │
                     │   │    → artifact: changed files                                           │
                     │   └─ job publish (contents: write, no API calls, no untrusted processing)  │
                     │        verify allow-list + README markers → one commit to main            │
                     │                                                                            │
                     │  Repository HanzzzBD/HanzzzBD (public)                                     │
                     │   README.md · assets/legends/** · docs/legends/** · legends/state/**       │
                     └────────────────────────────────────────────────────────────────────────────┘
  Visitors ──► github.com/HanzzzBD (README renders the committed SVG and Markdown)
```

## 4. Repository layout

```
.github/
  workflows/legends.yml          scheduled + dispatch pipeline (build → publish)
  workflows/legends-ci.yml       PR/push checks (typecheck, lint, tests, actionlint)
  dependabot.yml                 npm (legends/) + github-actions updates
legends/
  package.json  pnpm-lock.yaml  tsconfig.json  biome.json
  player.config.yml              L4 player configuration (owner-edited)
  rules/v1/                      ruleset data (exp, ranks, quests, medals, heroes, items, map, shop, seasons, tokens)
  src/                           TypeScript source (modules in §5)
  test/                          unit, property, golden, contract, scenario, security tests
  test/fixtures/                 recorded, scrubbed GitHub API responses
  state/                         committed game state (data-model.md §5)
assets/legends/{dark,light}/     generated SVGs
docs/legends/                    generated Markdown pages
README.md                        owner content + generated block between markers
```

## 5. Module boundaries

Dependency direction is strictly downward. `core` depends on nothing. Pure modules never import I/O modules.

```
            cli (orchestrator, I/O)
   ┌──────────┼──────────────┬──────────────┬─────────────┐
 github    collect ──► normalize        store (fs)     publish-prep
(I/O)        (I/O)      (pure)          (I/O)           (pure + fs)
                            │              │
                            ▼              ▼
                      engine (pure) ◄── ruleset, config (validated data)
                            │
                         derive (pure)
                            │
                         render (pure) ── tokens
                            │
                        validate (pure)
                 ─────────────────────────────
                   core: types, time, ids, hashing, canonical JSON, Result, errors
```

| Module | Kind | Responsibility | Key interface |
| --- | --- | --- | --- |
| `core` | pure | Shared types, `Clock`, `PlayerDay`/`IsoWeek`/`SeasonId` maths in Asia/Jakarta, stable hashing (SHA-256), canonical JSON, `Result<T,E>`, error taxonomy | `toPlayerDay(instant, tz)`, `canonicalJson(x)`, `stableHash(...)` |
| `config` | pure + parse | Load and validate `player.config.yml` (zod). Unknown fields are errors. No fields that set progress (AC-CORE-14). | `loadConfig(text): Result<PlayerConfig, ConfigError[]>` |
| `ruleset` | pure + parse | Load and validate `rules/v<n>/*`; expose typed rule tables; version id | `loadRuleset(dir): Ruleset` |
| `github` | I/O | Authenticated client (Octokit core + retry + throttling), GraphQL and REST helpers, rate-limit budget, request log (no bodies) | `GitHubClient.graphql<T>(q, vars)`, `.rest(route, params)`, `.budget()` |
| `collect` | I/O | Source collectors producing **raw records** per source, with completeness status and watermarks | `Collector.collect(ctx): Promise<SourceResult>` |
| `normalize` | pure | Raw → L1 `Event` (stable keys, qualification flags, fingerprints, automation signals, redaction); merges with the stored event set and assigns `firstSeenAt` | `normalize(raw, known, runAt): Event[]` |
| `store` | I/O | Read and write `legends/state/**` (NDJSON partitions, snapshots, meta, checksums); migrations | `StateStore.load()`, `.write(changes)` |
| `engine` | pure | Evaluators producing ledger entries. Sub-modules: `qualify`, `exp`, `battle`, `rank`, `bp`, `quests`, `medals`, `heroes`, `emblems`, `equipment`, `map`, `squad`, `records`, `season`, `purchases`, `campaigns` | `runEngine(input): EngineOutput` |
| `derive` | pure | L3 snapshot from ledger + events + config + ruleset | `deriveSnapshot(...): Snapshot` |
| `render` | pure | SVG components (typed builder), Markdown pages, README block, alt texts; two themes | `renderAll(snapshot, tokens): FileSet` |
| `validate` | pure | Output lint: SVG safety, size budgets, alt text, marker integrity, path allow-list | `validateOutputs(files): Issue[]` |
| `cli` | I/O | Orchestration, commands, logging, exit codes, job summary | `legends run | backfill | verify | rebuild --dry-run | render --fixtures` |

## 6. Data collection interfaces

```ts
interface Collector {
  readonly source: SourceId;                 // 'calendar' | 'commits' | 'pulls' | 'reviews' | 'issues' | 'releases' | 'repos' | 'languages' | 'workflows' | 'trees' | 'private'
  collect(ctx: CollectContext): Promise<SourceResult>;
}
interface CollectContext {
  client: GitHubClient; player: PlayerIdentity; runAt: Instant;
  watermark: Watermark | undefined;          // last complete position for this source
  budget: RequestBudget;                     // stop early and mark 'partial' when exhausted
  repos: RepoRef[];                          // eligible repo list from the 'repos' collector
}
type SourceResult =
  | { status: 'complete'; records: RawRecord[]; watermark: Watermark }
  | { status: 'partial'; records: RawRecord[]; watermark: Watermark; reason: 'budget' | 'error' }
  | { status: 'failed'; error: CollectError };
```

Collectors run in a fixed order (`repos` first, since others need the repo list), one at a time (secondary rate limits). Each is independently retryable.

## 7. GitHub API integration

| Source | API | Endpoint / query | Incremental strategy |
| --- | --- | --- | --- |
| Identity | REST | `GET /users/{login}` → numeric id, created_at, avatar | Every run (1 call) |
| Calendar and totals | GraphQL | `user.contributionsCollection(from,to){ contributionCalendar, restrictedContributionsCount, … }` | Current and previous year each run; older years once (backfill) |
| Repos | REST | `GET /users/{login}/repos?type=owner` + GraphQL `repositoriesContributedTo` | Every run; `pushed_at` decides which repos need detail fetches |
| Commits | GraphQL | `repository.defaultBranchRef.target.history(author:{id}, since)` → oid, parents count, additions, deletions, changedFilesIfAvailable, authoredDate, committedDate, message (hashed and classified at normalize time, never stored raw) | `since` = watermark − 7 days overlap, per repo with `pushed_at` > watermark |
| PRs and reviews | GraphQL | `user.contributionsCollection.pullRequestContributions / pullRequestReviewContributions` + per-PR `reviews(first)` | Window = current year; dedupe by node id |
| Issues | GraphQL | `issueContributions` + owned-repo `issues(states: CLOSED, filterBy: {since})` with `stateReason`, author, `closedBy` (timeline) | Watermark |
| Releases | REST | `GET /repos/{o}/{r}/releases` (owned repos) | First page unless `pushed_at` changed |
| Languages | REST | `GET /repos/{o}/{r}/languages` | When `pushed_at` changed; snapshot stored |
| Workflow runs (P1) | REST | `GET /repos/{o}/{r}/actions/runs?event=push&status=success&created=>…` | Watermark |
| Trees (P1) | REST | `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` | Only when the default-branch head SHA changed; weekly maximum |
| Private aggregate | GraphQL | `restrictedContributionsCount` delta | Every run |

**Client behaviour:** `@octokit/plugin-throttling` (respects `Retry-After`, secondary limits), `@octokit/plugin-retry` (5xx, network; max 3, exponential backoff), sequential requests, `User-Agent: github-legends/<version>`, a request budget per run (default stop at 80% of the remaining primary limit), and conditional requests (ETag) for languages and trees.

**Rate budget (estimate, single user, about 30 repos):** daily incremental ≈ 60–150 requests; backfill ≈ 1 GraphQL call per repo per 100 commits + yearly windows. Backfill is **resumable** (`data-flow.md` §5), so even a large history fits within the `GITHUB_TOKEN` limits across a few runs.

## 8. Event normalisation and duplicate prevention

- Every raw record maps to one L1 event with a **stable key** (`data-model.md` §2): `commit:<repoId>:<sha>`, `pr:<nodeId>`, `review:<prNodeId>:<reviewerId>` (one per PR, STK-3), `issue:<nodeId>`, `release:<id>`, `run:<id>`, `cal:<date>`, `private:<runDate>`.
- **Layer 1, event dedupe:** merge by key; first-seen wins for `firstSeenAt`; later observations may update *mutable facts* (for example `merged`, `stateReason`, repo visibility) as a new **revision** with a monotonic `rev` number. Awards reference `key@rev`.
- **Layer 2, award idempotency:** every ledger entry has an `idempotencyKey = <ruleId>|<subjectKey>|<periodId?>`. The ledger index rejects duplicates (STK-1).
- **Layer 3, content fingerprint:** commits that match an awarded commit's fingerprint (GDD §1.5) in the same repo within 30 days are marked `duplicate`.
- **Layer 4, run concurrency:** workflow `concurrency: legends` (no parallel runs); publish rebases onto the latest `main` and aborts if `legends/state/meta.json` changed underneath (optimistic lock on `stateVersion`).

## 9. Game engine

`runEngine` is a pure function:

```ts
runEngine({ ruleset, config, events, ledger, snapshotPrev, runAt, sourceHealth }) => {
  newEntries: LedgerEntry[];   // to append
  diagnostics: Diagnostic[];   // flags, rejections, warnings (for logs and job summary)
}
```

**Evaluation order (fixed; each step sees the entries appended by earlier steps in the same run):**

1. `qualify`: qualification flags (bot, fork, empty, merge, duplicate, automation flag window).
2. `exp`: per player day, **append-only cap allocation** (ADR-0006): ordinals continue from what the ledger already awarded that day.
3. `battle`: per effective day, monotonic score → Victory and MVP star entries, weekly star cap.
4. `rank`: derived; emits `tier_first_reached` BP entries and trial completion entries.
5. `bp`: activity and battle BP with the weekly cap.
6. `quests`: deterministic boards per open period; completion entries; expiry at closure.
7. `heroes` → `mastery` → `emblems` → `equipment` (P1): threshold unlocks.
8. `medals`, `campaigns`, `map` (P1), `records` (P1), `squad` (P1).
9. `season`: closure (once), season-end rewards.
10. `purchases` (P1): settle new requestIds in file order.

**Period closure guard:** a day, week or season closes only at the first run that is both ≥ 48 h after the period end **and** has `complete` status for every source the period depends on. A broken collector therefore never finalises a period on partial data.

### 9.1 Evaluators (summary)

| Evaluator | Inputs | Output entries | Notes |
| --- | --- | --- | --- |
| Quest evaluator | Board (seeded), qualifying events in period, eligibility facts | `quest_complete`, `quest_expired`, `dedication` | Board generation is a pure function of `(playerId, periodId, rulesetVersion, slot)` |
| Achievement (medal) evaluator | Counters from ledger and events, rank history, hero states | `medal` per tier | Earned-on = date of the qualifying event; evidence keys attached |
| Hero mastery evaluator | Commit EXP entries + language snapshot stored per award | `mp` (derived, not ledger) + `hero_unlock`, `mastery_tier` entries | MP stored in the snapshot; unlocks and tier BP in the ledger |
| Map evaluator (P1) | Level, medals, ranks, emblem levels | `region_unlock`, `checkpoint_clear` | Fixed slots from `rules/v1/map.yml` |

## 10. Progression storage

The details are in `data-model.md`. In summary, `legends/state/`:

- `events/YYYY-MM.ndjson`: L1 events, append and revise (by `rev`)
- `ledger/YYYY-MM.ndjson`: L2 entries, append-only
- `snapshot.json`: L3 derived snapshot (recomputable)
- `seasons/S<n>.json`: immutable archives
- `meta.json`: schema version, ruleset version, `stateVersion`, watermarks, backfill cursor, per-file SHA-256 checksums, last run status

## 11. Renderers

- **SVG renderer:** components from the design catalog, built with a typed node builder (`el('text', attrs, [text(value)])`). Text and attribute values are escaped at the builder boundary; attributes come from a per-element allow-list; colours only from the token set. Output is canonical (stable attribute order, fixed decimal precision) → byte-identical for identical input.
- **Map renderer:** fixed slots from `map.yml`; a state → style mapping; a bounding-box lint (≥ 16 px gaps) at build time.
- **Markdown renderer:** a builder with context-aware escaping (inline text, table cell, link text) and a URL builder restricted to `https://github.com/<validated path>`, relative repo paths and fragment anchors.
- **README renderer:** produces the block (design `readme-layout.md` §3), then a **marker injector** replaces exactly the content between one `START` and one `END` marker; any anomaly → `MarkerError`, and README is not changed.
- **Validation** runs on the complete output set before anything is handed to publish.

## 12. Workflow orchestration

```yaml
# .github/workflows/legends.yml (outline, not final)
on:
  schedule: [{ cron: '17 17 * * *' }]      # 00:17 WIB daily (D-07); off-minute
  workflow_dispatch: { inputs: { mode: { type: choice, options: [run, backfill, dry-run] } } }
permissions: {}                              # nothing by default
concurrency: { group: legends, cancel-in-progress: false }
jobs:
  build:
    permissions: { contents: read, actions: read }
    timeout-minutes: 20
    steps: checkout (persist-credentials: false) → setup-node 24 + pnpm (pinned SHAs)
           → pnpm install --frozen-lockfile --ignore-scripts → pnpm legends run --mode ${{ inputs.mode || 'run' }} (via env, not interpolated into the script)
           → upload-artifact: out/ (changed files + manifest + summary)
  publish:
    needs: build
    if: needs.build.outputs.changed == 'true' && inputs.mode != 'dry-run'
    permissions: { contents: write }
    timeout-minutes: 5
    steps: checkout main → download artifact → verify manifest (allow-listed paths, README outside-marker bytes identical, checksums)
           → git commit -m "chore(legends): update <date>" → push (retry with rebase ×3)
```

The second workflow, `legends-ci.yml` (on `pull_request` and `push`, `contents: read`), runs typecheck, lint, tests, actionlint, and `legends render --fixtures` golden checks. It never uses `pull_request_target`.

## 13. Error handling

| Class | Examples | Behaviour | Exit |
| --- | --- | --- | --- |
| `ConfigError` | Schema violation in `player.config.yml` | Keep previous selections, skip purchases, report in summary; continue | 0 (warning) |
| `CollectError` (per source) | 5xx after retries, 404 repo, permission | Source `failed` → no awards from it; periods depending on it are not closed; README health = stale if > 3 days | 1 if any source failed, but publish still runs for health and other sources |
| `BudgetExhausted` | Rate limit near the threshold | Source `partial`; watermark advanced only to the last complete page | 0 |
| `StateIntegrityError` | Checksum mismatch, unknown schema version, ledger parse error | **Abort**; no engine, no publish; summary explains | 2 |
| `RuleViolation` (internal invariant) | Negative BP, cap exceeded, duplicate key | Abort run (bug); no publish | 3 |
| `RenderValidationError` | Unsafe SVG, budget exceeded, marker error | No publish of outputs; state also withheld (atomic) | 4 |
| `PublishConflict` | `stateVersion` changed during the run | Abort publish; the next run redoes it | 5 |

Principles: fail closed on integrity; never write partial state; never show a fake zero (INT-5).

## 14. Logging and observability

- Structured JSON-lines logs to stdout through a single `log` module; levels `debug | info | warn | error`.
- **Workflow-command safety:** the logger escapes `%`, `\r`, `\n` and `::` in every message (security-model §6). Untrusted strings are never logged at the start of a line or verbatim. Logs contain IDs and counts, not titles or messages.
- **Job summary (`$GITHUB_STEP_SUMMARY`):** run mode, source statuses, request budget used, new events and entries per kind, flags (automation, duplicates), purchase results, closures, output diff list, warnings. Markdown-escaped.
- **Health in the product:** `meta.json` `lastSuccessfulRun`, rendered as "updated …" and the stale banner.
- **Failure notification:** GitHub's built-in emails to the owner on failed scheduled runs. No external alerting.

## 15. Testing strategy

See `testing-strategy.md`. Highlights: a pure engine allows exhaustive table and property tests; golden files for renderers; recorded fixtures for collectors; acceptance-criteria IDs in test names; no live API calls in CI.

## 16. Remaining blockers before implementation

| ID | Blocker | Type | Resolution path | Blocks |
| --- | --- | --- | --- | --- |
| B-01 | Confirm `GITHUB_TOKEN` can query `user.contributionsCollection`, `repositoriesContributedTo` and per-repo commit history for the player's public repos, and measure its GraphQL/REST limits | Spike (needs a workflow run on this repo) | Run a read-only spike workflow; else use the fallback PAT (ADR-0003) | Collector design details |
| B-02 | Day-boundary timezone of `contributionCalendar` against Asia/Jakarta | Spike | Compare calendar days to commit timestamps in recorded data | Streak medals, streak display |
| B-03 | Whether commits by `github-actions[bot]` count as repository activity for the 60-day schedule auto-disable | Spike / docs check | If not, document re-enable steps and rely on GitHub's warning email | Ops runbook |
| B-04 | README column width, task-list rendering, `<picture>` behaviour, SVG in the GitHub mobile app | Spike (render a test block on a scratch branch or gist) | Adjust card width or quest fallback | Presentation P0 |
| B-05 | Owner setting **"Include private contributions on my profile"** | Owner action | Owner enables it, or accepts that private EXP stays 0 | Private aggregate EXP (F-007) |
| B-06 | Repo settings: Actions enabled; default workflow token permission set to read-only (jobs request write explicitly); no branch protection blocking the bot, or a rule allowing it | Owner action | Owner confirms in Settings → Actions | Publish job |
| B-07 | Scheduled workflows run only from the default branch. This work is on `claude/github-legends-discovery-sjcejh`. | Owner decision | Open and merge a PR when implementation is ready | Going live |
| B-08 | Backfill volume unknown (repos, commits since 2022 or account creation) | Spike | Measure in B-01; tune the budget | Backfill duration |

None of these block **starting** implementation of the pure modules (`core`, `config`, `ruleset`, `engine`, `derive`, `render`, `validate`) against fixtures. B-01 and B-04 must be resolved before the collectors and the README presentation are finalised.
