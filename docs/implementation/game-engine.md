# GitHub Legends — Game Engine

- **Phase:** 06 (implementation) · **Date:** 2026-10-20 · **Ruleset:** `1.0.0`
- **Code:** `legends/src/engine/` · **Tests:** `legends/test/engine/`
- **Specification sources:** `docs/game-design/progression-tables.md` (values), `game-design-document.md` §1, §A, §B, §H (rules), `economy-balancing.md` §2–3 (EXP and BP), `docs/product/prd.md` §4 (qualification, stacking, effective dates), `docs/architecture/*` (ledger, determinism)

> GitHub Legends measures **verified activity**, not code quality. Nothing in the engine (EXP, level, rank, mastery) claims or implies that more commits mean better code. Caps and diminishing returns exist precisely because volume is a weak signal.

## 1. Scope

Implemented: EXP calculation, player level, rank and division, Battle Points (activity, battle, level-up, first-time tier, season-end), promotion rules (weekly star cap, promotion trials, banked stars), lifetime progression, seasonal progression (closure, soft reset, archives in the ledger) and progress toward the next level and rank.

**Not yet implemented** (later phases; their BP sources therefore do not appear yet): quests, medals, milestone campaigns, hero unlocks and mastery, emblems, equipment, world map, records, squad and purchases.

## 2. API

```ts
runEngine({
  config: { timezone: "Asia/Jakarta", season1Start: "2026-10-01", automationRepos: [], excludeRepos: [] },
  events,          // normalized events from the store (any revisions)
  ledger,          // existing append-only ledger
  runAt,           // the run's single clock reading
  closureAllowed,  // true only when all sources were collected completely
  unavailableKeys, // optional: event keys the store knows were deleted
}) → { newEntries, ledger, diagnostics, automationFlags, seasons, progress, rulesVersion }
```

The engine is pure: no I/O, no `Date.now`, no randomness (checked in tests by grep). It does not import the collection layer or the GitHub client; it only consumes the normalized event model.

## 3. Pipeline (fixed order)

| Step | Module | Output |
| --- | --- | --- |
| 1. Prepare events | `qualify.prepareEvents` | Latest revision per key; ties by content hash; rev 0 rejected |
| 2. Qualify commits | `qualify.qualifyCommits` | Timestamp → attribution → bot → fork, excluded, declared automation → merge → empty → cross-repo SHA dupes → fingerprint dupes → automation flags |
| 3. Commit EXP | `exp.allocateCommitExp` | `exp.commit` entries, diminishing curve continuing the day's ordinals |
| 4. Other EXP | `exp.allocateOtherExp` | `exp.pr`, `exp.review`, `exp.issue_opened`, `exp.issue_resolved`, `exp.release` with daily caps |
| 5. Private EXP | `exp.allocatePrivateExp` | `exp.private` per increase of the cumulative count |
| 6. Objectives | `progression.recordObjectives` | `trial` entries (`objective.reviewed_merge`, `external_merge`, `peer_review`, `community_fix`, `release`) |
| 7. Battles | `progression.awardBattles` | `star.victory`, `star.mvp` per effective day; weekly cap 5 |
| 8. Seasons (no closure) | `progression.progressSeasons(ctx, false)` | First-time tier BP, soft resets, season timelines |
| 9. Specialization | `heroes.evaluateSpecialization` | Hero unlocks, mastery, emblems, equipment (Phase 07) |
| 10. Facts, quests, campaigns, medals | `facts.buildFacts`, `quests.runQuests`, `quests.runCampaigns`, `medals.runMedals` | Boards, completions, expiries, campaign steps, medals (Phase 08) |
| 11. Season closure | `progression.progressSeasons(ctx, closureAllowed, archiveMeta)` | `season.close` with the frozen archive + `bp.season_end` |
| 12. Campaigns and medals (post-closure) | `runCampaigns`, `runMedals` | Those that need a closed season |
| 13. Activity and battle BP | `progression.awardActivityAndBattleBp` | `bp.activity`, `bp.battle_victory`, `bp.battle_mvp`; weekly cap 700 |
| 14. Level BP | `progression.awardLevelBp` | `bp.level_up` per level |
| 15. Corrections | `progression.flagUnavailableSources` | `flag.source_unavailable` (amount 0) |
| 16. Invariants and views | `engine.assertInvariants`, `deriveProgress`, `seasons.seasonsView`, `seasons.scheduleView` | Throws on any invariant breach; returns progress, records and schedule |

Step 1 also drops events whose latest revision is `unverifiable` (Phase 08, diagnostic `unverifiable_event`).

## 4. Ledger and duplicate prevention

Every award is a `LedgerEntry` whose `id` is its idempotency key, so a rule can reward a subject only once (STK-1). The ledger is append-only: existing entries are never modified or removed.

| Award | Id |
| --- | --- |
| Commit EXP | `exp.commit|<eventKey>` |
| PR / review / release EXP | `exp.pr|<key>`, `exp.review|<key>`, `exp.release|<key>` |
| Issue EXP | `exp.issue_opened|<key>`, `exp.issue_resolved|<key>` (STK-4: once each) |
| Private EXP | `exp.private|<windowFrom>|<cumulativeCount>` |
| Objective | `objective|<key>` |
| Stars | `star.victory|<day>`, `star.mvp|<day>` |
| BP | `bp.activity|<expId>`, `bp.battle.victory|<day>`, `bp.battle.mvp|<day>`, `bp.level|<n>`, `bp.tier|<season>|<tier>`, `bp.season_end|<season>` |
| Season | `season.close|<season>` (meta: finalStars, peakTier, rawStars, banked, startStars) |
| Correction flag | `flag.source_unavailable|<key>` |

Subjects reference events as `key@rev`, so an audit shows which observation an award came from.

**Append-only cap allocation (ADR-0006):** when an event arrives late for a day that already has awards, it takes the next commit ordinal and the remaining cap. Past entries are never re-allocated. If events arrive in chronological order (normal daily runs), incremental results equal a single batch run (tested).

**Stacking rules implemented:**

| Rule | Implementation |
| --- | --- |
| STK-1 | Idempotency ids |
| STK-2 | Commit and PR EXP stack; only default-branch commits are collected |
| STK-3 | One review event per PR (collector) and one `exp.review` per key |
| STK-4 | Separate ids for issue opened and resolved |
| STK-5 | Not applicable yet (quests not implemented) |
| STK-6 | Battles award stars and BP only, never EXP |
| STK-7 | Level, tier and season-end BP stack with activity BP (milestones) |
| STK-9 | Contribution-calendar days never produce EXP |
| STK-10 | Private EXP is a separate aggregate; it is excluded from battle scores |

## 5. Systems

### 5.1 EXP (economy-balancing §2)

| Activity | EXP | Daily rule | Qualification |
| --- | --- | --- | --- |
| Commit #1–5 / #6–10 / #11+ | 10 / 5 / 0 | Per player day by author date | Player is primary author, human, non-fork, one parent, additions + deletions > 0, not a duplicate, not automation |
| PR merged, contested | 60 | PR cap 150 | Player-authored, merged; repo not owned **or** approved by a human account ≥ 30 days old |
| PR merged, self | 15 | Max 2 per day; PR cap 150 | Otherwise |
| Review | 25 | Cap 100 | Player review of a human's PR: APPROVED, CHANGES_REQUESTED, or COMMENTED with a body |
| Issue opened | 10 | Cap 30 | Player-authored; ≥ 24 h old; not closed as NOT_PLANNED within 24 h |
| Issue resolved | 15 | Cap 45 | Owned repo, closed as COMPLETED by the player |
| Release | 50 / 20 (pre) | Cap 100 | Player-published, owned repo, ≥ 3 qualifying commits since the previous release, ≤ 1 per repo per 7 days |
| Private contributions | 4 each | 200 per ISO week | Increase of the cumulative restricted count |

Lifetime EXP uses the **event day** for caps. Each award also carries an **effective day** = day of `max(event time, firstSeenAt − 48 h)` (PRD §4.4), which is used for battles and weekly caps.

### 5.2 Level

`cumulative(n) = 100(n−1) + 25(n−1)(n−2)`, maximum 100 with overflow. Titles at 1, 10, 20, 30, 40, 50, 60, 75, 100. Progress: `expIntoLevel`, `expForNext`, `expRemaining`, `overflow`.

### 5.3 Battles and stars

One battle per active effective day from Season 1. Score = EXP awarded on that effective day (private EXP excluded). Victory at ≥ 30 gives +1 star; MVP at ≥ 100 with a contested objective that day gives +1 more (2 in total). Stars are awarded as soon as a threshold is crossed: scores only grow, so nothing is ever revoked. Weekly cap: 5 stars per ISO week; further stars are recorded as `overflow` with amount 0.

### 5.4 Rank, divisions and promotion trials

Rank = `rankFromStars(gatedStars)`, where gated stars = season start stars + earned stars, held at the previous tier's division I while a gated tier's trial is incomplete (the excess is **banked** and applies as soon as the trial completes). Trials count objective entries in the season: objectives, contested objectives, distinct repos (Ascendant) and distinct human counterparts (Eternal). Tiers at or below the season's starting tier are not gated again. Objectives are ledger entries, so trial progress (and therefore rank) never decreases (P-04).

### 5.5 Seasons

Calendar quarters in the player's timezone from `season1Start`. A season closes at the first run ≥ 48 h after its end **and** with `closureAllowed`. Closure writes `season.close` (final stars, peak tier) and `bp.season_end` (by peak tier), once. The next season starts at `softResetStars(final)` (−3 tiers). Closed seasons are immutable: no stars, objectives or tier BP are added to them afterwards, even for late backfill (which still earns lifetime EXP). Missed runs close all elapsed seasons in order. Weeks that straddle seasons (2026-W53) share the weekly caps, while stars belong to their battle day's season.

### 5.6 Battle Points

| Source | Amount | Limit |
| --- | --- | --- |
| Activity | floor(20% of each EXP award) | 700 per ISO week, shared with battle BP; none for days before Season 1 |
| Battle | Victory 15, MVP +15 (30 in total) | Same weekly cap |
| Level-up | 25, or 125 on multiples of 10 | Milestone (uncapped), granted for backfill too |
| First-time tier per season | Squire 30 … Eternal 400 | Milestone |
| Season end | Initiate 100 … Eternal 1,000 | Milestone |

### 5.7 Progress output

`progress.lifetime`: exp, level, title, expIntoLevel, expForNext, expRemaining, overflow, bp. `progress.season`: season id and dates, daysLeft, startStars, rawStars, stars, bankedStars, rank (tier, division, label, stars in and for division), next division or tier with stars needed, the next gated tier's trial (requirements and progress), blockedBy, weekStars and the weekly cap.

## 6. Anti-abuse

| Threat | Handling | Diagnostic code |
| --- | --- | --- |
| Duplicate webhook or API events | Latest revision per key; idempotency ids; dedupe in the collector | `duplicate_event_input` |
| Empty commits | 0 lines changed → not qualifying | `empty_commit` |
| Merge commits | > 1 parent → not qualifying | `merge_commit` |
| Commit spam | Diminishing curve (75 per day maximum), micro-flood flag, weekly star cap, trials | `automation_micro_flood` |
| Scripted commits | Clockwork flag (same ±2 min on ≥ 10 days, ≥ 80% of commits; message patterns count) | `automation_clockwork` |
| Bot activity | Bot actors never qualify; bot-authored PRs give no review EXP; bot approvals are not contested | `bot_actor`, `review_not_qualifying` |
| Repeated workflow runs | Workflow runs give no EXP or BP | — |
| Duplicate contributions across repos | Same public SHA counts once; rebases or cherry-picks (fingerprint) count once within 30 days per repo | `duplicate_sha`, `duplicate_fingerprint` |
| Invalid timestamps | Unparseable, pre-2008, or future-dated relative to observation → nothing awarded | `invalid_timestamp` |
| Missing actor attribution | No actor, or the player is not the primary author, or the PR author is unknown → not qualifying | `missing_actor`, `not_player_author` |
| Backdating | Effective date `max(event, firstSeen − 48 h)` for battles and weekly caps | — |
| Sockpuppet approvers | Account age ≥ 30 days; Eternal needs ≥ 3 distinct counterparts | — |
| Self-merges | 15 EXP, max 2 per day, never objectives | — |
| Release spam | ≥ 3 qualifying commits since the previous release, 7-day cooldown per repo, ≤ 2 objectives per week | `release_too_few_commits`, `release_cooldown` |

Diagnostics are aggregated (code, count, up to 5 example keys). Keys for private repos are pseudonyms, so diagnostics are safe to show in job summaries.

## 7. Corrections and deleted events

| Situation | Behaviour |
| --- | --- |
| A later revision makes an event qualify (PR merged, issue closed) | Awarded in that run (the id is per rule and key, not per revision) |
| A later revision would disqualify an awarded event (issue reopened) | **No revocation**; the award stays (PRD INT-4) |
| A later revision changes an award's basis (approvals added after a self-merge award) | No top-up; the first award stands. Objectives derived from the new facts are still recorded |
| A source event disappears (repo deleted, commit force-pushed away) or is reported in `unavailableKeys` | Awards stay; one `flag.source_unavailable` entry (amount 0) is recorded per key for audit and redaction |
| Rules change | Prospective: entries keep their `ruleVersion`; a full rebuild is a separate, explicit maintenance action (PRD §8, not implemented yet) |

## 8. Determinism and invariants

- Inputs are sorted canonically before evaluation; every map iteration that affects output is over sorted keys.
- Integer arithmetic only (activity BP = `floor(EXP × 20 / 100)`).
- The same input gives byte-identical output (property test); shuffled input gives identical entries (property test); rerunning with the returned ledger adds nothing (property test); earlier ledger entries are never modified (property test).
- `assertInvariants` throws if ids repeat, amounts are non-integer or negative (except BP purchases), the BP balance goes negative, daily commit EXP exceeds 75, weekly stars exceed 5, or weekly activity and battle BP exceed 700.

## 9. Differences from the approved design

No value from the approved tables was changed. Where the documents were ambiguous, the engine's choices are listed in `progression-tables.md` §10 (C-1 … C-11). Two need the owner (`docs/product/decision-register.md`):

- **PD-20:** a capped award that crosses the daily cap receives the remainder (as in the economy model), not 0 (as one PRD sentence could be read).
- **PD-21:** a season with no activity still pays the Initiate season-end reward (100 BP) as the table says.

Other differences from the architecture:

- **Ruleset as code, not YAML (ADR-0011):** `rules.ts` holds ruleset `1.0.0` as typed constants until the config and ruleset loader exists. Tests bind it to the documentation tables, so drift is caught.
- **Cross-repo SHA duplicates** were added for "duplicate contributions across repositories" (GDD §1.5 defined only same-repo fingerprints).
- **Counterparts for external merges** are unknown (the merger's id is not collected), so Eternal's counterpart count comes from approvers, reviewed PR authors and issue authors.
- **Effective date of revised facts** uses the key's `firstSeenAt`. Merge, close and publish times are set by GitHub servers and cannot be forged; the period-closure guard (`closureAllowed`) prevents finalising periods while sources are failing.

## 10. Known limitations

1. Release qualification only sees releases and commits inside the collection window (the earliest release in the window may lack its true predecessor).
2. The micro-flood rule can flag a genuine burst of ≥ 10 tiny commits in an otherwise quiet repo (accepted false-positive risk, GDD §1.6). The flag affects only that day.
3. Activity BP is still granted for EXP that lands (through late backfill) on days of an already closed season. BP is a lifetime currency, but stars are not added.
4. Quest, medal, mastery, emblem and purchase BP flows are not implemented yet, so BP balances are lower than the full design.
5. Large-volume performance: 35,000 commits (5,000 a day for 7 days) run in about 1–3 s in tests. Automation detection is O(days × window commits + 1,440 × 5) per repo-day.

## 11. Tests

| File | Tests | Covers |
| --- | --- | --- |
| `tables.test.ts` | 67 | Parses `progression-tables.md`; every level row and boundary, every rank row and division threshold, star counts 0–200, trials, battle table, soft reset, season-end BP, season calendar, ISO weeks (2026-W53), trial gating and banking |
| `exp.test.ts` | 25 | Commit curve and local day boundaries, append-only ordinals, zero activity, empty, merge, bot, fork and unattributed commits, invalid timestamps, cross-repo and fingerprint duplicates, duplicate input events, rev 0, clockwork, pattern evidence, normal developers not flagged, micro-flood, declared and excluded repos, 35,000-commit volume, PR, review, issue, release and private rules, workflow runs |
| `progression.test.ts` | 21 | Battle thresholds, MVP rules, weekly star cap and overflow, pre-Season-1 behaviour, Warden I ceiling without objectives, banked stars released by trials, tier BP once, next-division progress, season closure (grace, closure guard, soft reset, rewards once, immutability, W53 straddle, missed runs), activity BP, weekly BP cap, level BP, corrections (late merge, reopened issue, deleted source, backdating), objectives and release objective cap |
| `determinism.test.ts` | 10 | Byte-identical output, order independence, idempotent reruns, append-only ledger, incremental = batch, invariants under random activity, anti-manipulation ceiling, monotonic EXP and level, input validation |

Run from `legends/`: `pnpm check` (typecheck + Biome + Vitest). The full suite (collection and engine) is 198 tests.
