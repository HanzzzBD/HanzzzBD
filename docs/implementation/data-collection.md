# GitHub Legends — Data Collection Layer

- **Phase:** 05 (implementation) · **Date:** 2026-10-20
- **Code:** `legends/src/{core,github,normalize,collect}` · **Tests:** `legends/test/`
- **Related:** `docs/architecture/data-model.md` §2 (event model), `security-model.md` §4.1–4.2, ADR-0012, ADR-0014

## 1. What this layer does

`collect()` turns GitHub API data into **normalized, privacy-minimised events** with stable keys, provenance and a verification status. It reports, per source, whether the data is complete. It does **not** award EXP, persist state or render anything: those are the engine, store and render phases.

```
collect(config, client, runAt, privacySalt?)
  1. validate window, authorise private collection (fail closed)
  2. identity     GET /users/{login}                     → PlayerIdentity (id, nodeId)
  3. scope        owned repos (REST) + contributed (GraphQL) + include/allow lists → RepoFilter
  4. sources      calendar → pullRequests → reviews → issues → commits → closedIssues
                  → releases → languages → workflowRuns        (fixed order, sequential)
  5. dedupeBatch  type-aware combine (reviews, issues)
  6. assertPrivacyInvariants
  → CollectionResult { status, coverage, player, scope, sources[], events[], stats }
```

## 2. Module map

| File | Responsibility |
| --- | --- |
| `core/errors.ts` | `CollectError` taxonomy, `SafeError` (no URLs, tokens or response text) |
| `core/hash.ts` | SHA-256, HMAC-SHA256, canonical JSON |
| `core/log.ts` | JSON-lines logger: workflow-command escaping, token redaction |
| `github/client.ts` | `GitHubClient`: REST and GraphQL, capped pagination, retries, rate limits, budget, validation |
| `github/schemas.ts` | zod schemas listing **only** the fields the game needs (extra fields are stripped) |
| `github/queries.ts` | Named GraphQL operations (`LegendsCommitHistory`, …) |
| `normalize/event.ts` | Event model types |
| `normalize/privacy.ts` | `Privacy`: `RepoRef`s; HMAC pseudonyms for private identifiers |
| `normalize/normalizers.ts` | Per-type normalisers; message normalisation, fingerprints, tag sanitising |
| `normalize/dedupe.ts` | `dedupeBatch`, `mergeObservations`, `latestByKey`, `findFingerprintDuplicates` |
| `collect/config.ts` | `collection` config schema (strict), private-repo authorisation |
| `collect/scope.ts` | `RepoFilter`, `resolveScope` |
| `collect/sources.ts` | One collector per source |
| `collect/types.ts` | `runUnits` (per-unit error isolation), status rules, year windows |
| `collect/collect.ts` | Orchestrator, privacy invariants |

## 3. Sources and APIs

| Source | API | Endpoint / operation | Unit | Notes |
| --- | --- | --- | --- | --- |
| identity | REST | `GET /users/{username}` | — | Must be `type: User`; failure is fatal |
| scope (owned) | REST | `GET /users/{username}/repos?type=owner` | — | Public repos only (this endpoint never lists private repos) |
| scope (contributed) | GraphQL | `LegendsContributedRepos` (`repositoriesContributedTo`) | — | Excludes the user's own repos; recent contributions only (see §6) |
| scope (explicit) | REST | `GET /repos/{owner}/{repo}` | per entry | `scope.include` and `privateRepos.allow` |
| calendar | GraphQL | `LegendsCalendar` (`contributionCalendar`, `restrictedContributionsCount`) | ≤ 1-year window | Streaks and private aggregate only |
| pullRequests | GraphQL | `LegendsPullRequests` (`pullRequestContributions`) | window | PRs **opened** by the player in the window |
| reviews | GraphQL | `LegendsReviews` (`pullRequestReviewContributions`) | window | One event per (PR, player) |
| issues | GraphQL | `LegendsIssues` (`issueContributions`) | window | Issues **opened** by the player |
| commits | GraphQL | `LegendsCommitHistory` (default-branch `history(author: {id})`) | repo | Additions, deletions, parents, co-authors |
| closedIssues | GraphQL | `LegendsClosedIssues` (owned repos, `CLOSED_EVENT` actor) | owned repo | Needed for "community fix" (closer + author) |
| releases | REST | `GET /repos/{owner}/{repo}/releases` | owned repo | Filtered to the window |
| languages | REST | `GET /repos/{owner}/{repo}/languages` | repo | Snapshot per run day |
| workflowRuns (off by default, P1) | REST | `GET /repos/{owner}/{repo}/actions/runs?event=push&status=success` | owned repo | Bot runs kept but flagged |

**Collaborator lists are not collected.** `GET /repos/{owner}/{repo}/collaborators` needs push access and returns personal data the game does not need. Allies come from verified interactions (PR approvers, review targets, co-authors), as designed (GDD §I).

## 4. Attribution rules

| Fact | Rule |
| --- | --- |
| Player identity | Numeric user id from `GET /users/{login}`; the login is only the lookup key (renames are safe) |
| Commit authorship | Default-branch commits returned by `history(author: {id: <player node id>})`. `playerIsPrimaryAuthor` is true when the first listed author is the player. Co-authors: other linked human users in `authors` |
| Bot | GraphQL `__typename: Bot`, REST `type: Bot`, or a login ending in `[bot]` → `actor.kind = "bot"` |
| Player-authored PR, review or issue | Actor `databaseId` equals the player id (never compared by login) |
| Approvals | `APPROVED` reviews by human, non-player accounts; `accountCreatedAt` kept for the 30-day human-account rule |
| Issue closer | Actor of the last `CLOSED_EVENT`; `closedByPlayer = null` when not observed or unknown (never guessed) |
| Ownership | `ownedByPlayer` when the repo owner login equals the player login (organisation repos are not "owned") |
| Merge and empty commits | Recorded as facts (`parentCount`, `additions + deletions`); disqualification happens in the engine |
| Automation hint | `messagePatternHit` from literal, case-insensitive substrings (`automationMessagePatterns`), evaluated in memory |

## 5. Duplicate prevention primitives

| Primitive | Purpose |
| --- | --- |
| Stable keys | Same GitHub object → same key on every run (`commit:<repo>:<sha>`, `pr:<nodeId>`, …) |
| `dedupeBatch` | One event per key per run; conflicts resolved deterministically (more complete verification wins; reviews keep the earliest; issues keep the observation that knows the closer); provenance sources merged |
| `mergeObservations` | Cross-run: new key → rev 1 with `firstSeenAt`; identical facts → no change; changed facts → rev + 1 with `firstSeenAt` preserved |
| `latestByKey` | Reads the latest revision of each key from stored lines |
| `findFingerprintDuplicates` | Rebased or cherry-picked commits (same normalised message and size, same repo, ≤ 30 days) → duplicate-of mapping |

Properties tested with fast-check: batch dedupe is independent of input order; re-merging the same observations adds nothing.

## 6. Data limitations (read before designing rules)

1. **The contribution calendar is not a commit list.** It counts contributions by GitHub's rules (linked email, default branch, non-fork, plus issues, PRs and reviews, plus private counts if enabled). It is used only for streaks (STK-9). Day boundaries versus Asia/Jakarta are unconfirmed (blocker B-02), so calendar events are marked `partial` with `calendar_timezone_unconfirmed`.
2. **Commits are found only in scoped repos.** Commits to repos outside the scope (not owned, not in `repositoriesContributedTo`, not in `include`) are not collected. `repositoriesContributedTo` only covers recent contributions **[verify window in spike B-01]**. Use `scope.include` for older external repos.
3. **Co-authored commits:** the history `author` filter matches the commit author. Commits where the player is only a co-author are **not** returned. Co-authors of the player's own commits are recorded.
4. **Unlinked emails:** commits whose author email is not linked to the account are invisible to the author filter (they still exist in the repo).
5. **Default branch only:** branch commits count once merged into the default branch. Squash merges produce one commit. Rebases produce new SHAs, which the fingerprint primitive catches.
6. **PR and issue windows use creation time:** `pullRequestContributions` and `issueContributions` include items **opened** in the window; their current state (merged, closed) is read at collection time. Items opened before `since` are not revisited.
7. **Closed issues in owned repos** are filtered by `updatedAt ≥ since` (GitHub's `filterBy.since`), so older closures are not re-read.
8. **Approval lists are capped at 20** per PR (`approvals_truncated` note); co-author lists at 10 (`co_authors_truncated`).
9. **Languages are repository bytes** (Linguist), not authored lines (GDD §C.5).
10. **Private work** is visible only as `restrictedContributionsCount`, and only if the owner enables "Include private contributions on my profile" (blocker B-05). Per-repo private detail needs the opt-in (§7).
11. **Deleted or newly private repos** stop returning data; the store layer must apply the redaction rules (ADR-0009). This layer simply no longer emits their events.
12. **No ETag caching yet:** every run re-reads languages and releases for scoped repos (bounded by `maxRepos` and the budget).
13. **Watermarks are not persisted here.** The result's `coverage` and per-source `status` tell the store which sources may advance their watermark: only `complete` ones.

## 7. Configuration (`collection` section)

```yaml
collection:
  login: <github-login>              # resolved to a numeric id at run time
  since: "2026-10-01T00:00:00Z"      # earliest instant to collect
  scope:      { owned: true, contributed: true, includeForks: false, includeArchived: true,
                include: [], exclude: [], maxRepos: 100 }
  privateRepos: { enabled: false, allow: [], allowPublicNames: [], includeLanguages: false }
  sources:    { calendar: true, commits: true, pullRequests: true, reviews: true, issues: true,
                closedIssues: true, releases: true, languages: true, workflowRuns: false }
  limits:     { maxRequests: 900, maxPagesPerQuery: 10 }
  automationMessagePatterns: ["[skip ci]", "auto-update", "chore(auto", "automated", "bump version"]
```

Unknown keys are rejected. `privateRepos.allow` without `enabled` is rejected. `allowPublicNames` must be a subset of `allow`. Enabling private repos also needs the `LEGENDS_PRIVACY_SALT` secret and a token that can read those repos (`security-model.md` §4.1).

## 8. Error handling and status

| Situation | Result |
| --- | --- |
| Identity lookup fails, invalid window, or private enabled without salt | `status: failed`, `fatal: SafeError`, no events |
| A unit fails (one repo or window) | Recorded in `sources[].issues` (unit = repo pseudonym or window id); other units continue; source `partial` |
| Page cap reached | Unit listed in `truncatedUnits`; source `partial` |
| Budget or rate-limit reserve reached | That unit and all remaining units of the source get `budget_exhausted` issues; later sources fail fast the same way; overall `partial` |
| Every unit of a source failed | Source `failed`; overall `partial` |
| Everything succeeded | `status: complete` |

Nothing is ever reported as complete when data is missing, and no fallback data is fabricated.

## 9. Tests

`legends/test/` (Vitest 5, fast-check). The global `fetch` throws in tests (`test/setup/no-network.ts`). All fixtures are synthetic (`sample-player`, id 1000001); no real tokens or accounts.

| File | Covers |
| --- | --- |
| `test/github/client.test.ts` (23) | Headers, route validation, schema errors without values, HTTP error mapping without leaks, 5xx retry with bounded backoff, retries exhausted, network retry, `Retry-After`, primary limit, rate-limit reserve, request budget, Link pagination, page cap, cross-origin link refusal, invalid caps, GraphQL cursor cap, GraphQL error types, partial-data refusal, token never logged |
| `test/normalize/normalizers.test.ts` | Commit facts, message not stored, automation flag, rebase fingerprint, verification notes, PR approvers (bots and player excluded), truncation notes, review collapse, issue closer states, tag sanitising |
| `test/normalize/privacy.test.ts` | Public passthrough, private refusal without opt-in or salt, HMAC pseudonyms (salt-dependent), explicit name allowance, no leakage of SHA, name, message, login, node id or numeric id |
| `test/normalize/dedupe.test.ts` | Batch dedupe, conflict resolution, order independence (property), `firstSeenAt` and backfill, idempotent re-merge (property), revisions, fingerprint duplicates |
| `test/collect/config.test.ts` | Defaults, strictness, private allow-list consistency, salt authorisation |
| `test/collect/collect.test.ts` | End-to-end on fixtures: statuses, scope filtering, pagination, private drops, dedupe across sources, window filtering, no forbidden text, safe logs; partial on unit failure, page cap and budget; fatal identity failure; private opt-in with pseudonyms; unauthorised private slot |
| `test/core/log.test.ts` | Workflow-command neutralisation, token redaction, canonical JSON |

Run from `legends/`:

```
pnpm install --frozen-lockfile --ignore-scripts
pnpm check          # tsc --noEmit + biome check + vitest run
```

## 10. Not yet done (next phases)

- Persisting events (`StateStore`), watermarks and the backfill cursor; calling `mergeObservations` against stored state.
- Workflow wiring (`legends.yml`), the CLI entry point, and the `LEGENDS_READ_TOKEN` fallback.
- ETag conditional requests; tree and marker detection for equipment (P1).
- The live spike (B-01, B-02, B-08) to confirm `GITHUB_TOKEN` access, calendar timezone and volumes; then record real (scrubbed) fixtures for contract tests.
- Coverage reporting (needs `@vitest/coverage-v8`; not added yet).
