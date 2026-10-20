# GitHub Legends — Quest System (Daily, Weekly, Contracts, Campaigns)

- **Phase:** 08 (implementation) · **Date:** 2026-10-20 · Ruleset `1.0.0`
- **Code:** `legends/src/engine/quests/` (`catalog.ts`, `engine.ts`, `campaigns.ts`), `legends/src/engine/facts.ts`
- **Tests:** `legends/test/engine/quests.test.ts`
- **Spec:** GDD §F, `quest-catalog.md` §1–§7, PRD §4.4 (effective dates) and STK-5/7/11
- **Companions:** `achievement-system.md` (medals), `season-system.md` (seasons, archives, scheduling)

Quests reward **Battle Points only** (STK-5). Every condition reads verified, qualifying activity from the facts index described below, never raw API data and never configuration.

## 1. Facts index (`facts.ts`)

`buildFacts(ledger, events, specialization, config, rules)` builds one read-only view per run. Quests, campaigns, medals and season archives all read this view.

| Fact | Source | Notes |
| --- | --- | --- |
| Commits, PRs, reviews, issues opened/resolved, releases | `exp.*` ledger entries | Only activity that already passed qualification (bots, spam, duplicates, automation and invalid timestamps removed). Days are **effective** days. `earned` is false for commits beyond the daily curve |
| Objectives | `objective.*` (`trial`) entries | `contested` and `counted` flags |
| Battles | Daily EXP score plus `star.victory` / `star.mvp` entries | A battle is any day with score > 0 |
| Workflow runs | `workflow_run` events | Successful, `push`, triggered by the player, in an owned public non-fork repo |
| Calendar | `contribution_day` events | Used only for streaks |
| Heroes per repo, domain shares, migration repos | Latest language snapshot and markers (`attribution`) | Hero share ≥ 10% |
| Approvals received | PR events | Approvals from established human accounts |

Events whose latest revision is `unverifiable` are dropped in `prepareEvents` before any award. This is new in Phase 08; diagnostic `unverifiable_event`.

## 2. Quest definition (`catalog.ts`)

Each `QuestDef` provides everything the brief requires:

| Field | Meaning |
| --- | --- |
| `id`, `name`, `description` | Stable identifier (`D01`…, `W01`…, `C02`…, `E-FE`…, `S01`…) and display text from the catalog |
| `pool`, `slots` | `daily` · `weekly` · `specialty` · `contract`; daily slot numbers (1 core, 2 variety, 3 any) |
| `eligible(ctx)` + `eligibilityRule` | Predicate over facts **before the period starts**, with its human-readable rule |
| Start and end | Implied by the pool: the player day, the ISO week (clipped to Season 1) or the season |
| `progress(ctx)` | Evaluator returning `{current, target, completedOn, evidence}`. `completedOn` is the effective day the target was reached |
| Completion criteria | `completedOn !== null` within the period window; `evaluateAtClose` quests (W10 "Tidy Week") are judged only when the period closes |
| `reward` | BP from `quest-catalog.md`; contracts also carry a cosmetic id |
| `repeatable` | `per_day` · `per_week` · `per_season` |
| `verification` | Evidence description, shown in the board view |
| `available` + `unavailableReason` | Quests whose data or system does not exist yet never enter a pool |

Catalog content is unchanged from `quest-catalog.md`: D01–D11, C01–C02 (daily), W01–W10, C03–C06 (weekly), E-FE/E-BE/E-FS/E-AI/E-OP/E-DB/E-OS (specialty), S01–S06 (contracts), K1–K10 (campaigns), and Dedication (50 BP).

## 3. Boards (`engine.ts`)

- **Seeding:** `seededPick(pool, playerId, periodId, rulesVersion, slot)` sorts the pool by id, then picks index `sha256(playerId|periodId|rulesVersion|slot)[0..12] mod n`. The result does not depend on machine, input order or clock. `config.playerId` is the numeric GitHub user id (default 0). It is never displayed.
- **Frozen boards:** the first run that sees a period writes `quest.board|<pool>|<period>` with `meta.quests` (comma-separated ids). Later runs read that entry and never regenerate the board, even after a ruleset or seed change (GDD §F.3).
- **Daily** (3 slots): slot 1 from quests tagged slot 1 (D01, D02); slot 2 from the eligible variety quests, falling back to D03; slot 3 from any eligible quest not already on the board.
- **Weekly** (3 slots): offered only when the level, from EXP earned before Monday, is ≥ 3. Otherwise the week gets an empty board.
- **Specialty** (+1 weekly slot): the quest of the emblem active at the start of the week, if any.
- **Contracts:** 2 per season (`CONTRACTS_PER_SEASON`), drawn when the season's board is first written.
- **Catch-up:** every run walks all periods from Season 1 to today and skips closed ones. A missed run delays rewards but never loses them (see `season-system.md` §5).

## 4. Completion, rewards and anti-abuse

Completion writes two entries with deterministic ids:

| Entry | Id | Kind / rule | Amount |
| --- | --- | --- | --- |
| Completion record | `quest|<questId>|<period>` | `quest` / `quest.complete` (`meta.pool`, `meta.evidence`) | 0 |
| Reward | `bp.quest|<questId>|<period>` | `bp` / `bp.quest` (cosmetic id for contracts) | Catalog BP |

- **No duplicates:** ids are idempotency keys (`LedgerIndex.add` refuses an existing id). Reruns, duplicate event input and replays add nothing.
- **Effective day:** both entries carry the day the target was reached and that day's season. A completion in the 2026-W53 week that lands on 2027-01-02 belongs to Season 2.
- **No stacking with EXP or stars (STK-5):** quests never write EXP or star entries. Quest BP is outside the 700 BP weekly cap, which applies only to activity and battle BP (economy-balancing §1).
- **Dedication:** +50 BP once per ISO week (`quest|dedication|<week>`), on the fifth day that week with all 3 dailies done. It stacks with the dailies' own BP. It is evaluated **before** the weekly board closes, so a single catch-up run pays it exactly like daily runs. A test found and fixed this ordering bug.
- **Cross-quest counting:** only contracts (S01, S02) count other quests' completions, and they count across periods (GDD §F.6).

## 5. Expiration

A period closes when both hold:

1. `runAt ≥ start of the day after the period ends + 48 h` (Asia/Jakarta), and
2. `closureAllowed` is true, meaning every source the period depends on was collected completely (the closure guard).

On closing, the engine:

1. evaluates close-time quests (W10);
2. writes `quest.expired|<questId>|<period>` (`reason: "expired"`, amount 0) for each incomplete quest;
3. writes `quest.closed|<pool>|<period>` (rule `quest.period_closed`).

Closed periods are never evaluated again. Activity first seen after a closure cannot reach the closed period: its effective date is `max(event date, firstSeenAt − 48 h)`, which falls after the period. Contracts close with the season, 48 h after the season's last day.

| Period | Active | Closes |
| --- | --- | --- |
| Daily | Player day 00:00–23:59:59 WIB | 48 h after the day ends |
| Weekly / specialty | Mon–Sun (ISO week) | 48 h after Sunday ends |
| Contract | Season | 48 h after the season ends (with the season) |
| Campaign | Unlimited | Never |

## 6. Milestone campaigns (`campaigns.ts`)

- Steps are recorded **in order** as `campaign.step|<K>|<n>`. A step's day is `max(its own completion day, the previous step's day)`, and earlier verified history counts (backfill-friendly, GDD §F.5).
- Steps pay nothing. When the last step is recorded, the engine writes `campaign|<K>` and `bp.campaign|<K>` with the catalog BP and cosmetic (STK-7, STK-11).
- K5 reads season state: the Champion trial day, the star history for Champion II, and the frozen `peakTier` of closed seasons. K10 reads closed seasons (4 consecutive), level 50 via cumulative EXP, and any Virtuoso tier.
- `featuredCampaign` returns the first available, incomplete campaign (README).
- Campaigns run twice per engine run, before and after season closure, so steps that depend on a just-closed season are recorded in the same run.

## 7. Output

`runEngine(...).quests` (`QuestBoardsView`) contains:

- `today`: the daily board;
- `week`: the weekly board plus the specialty slot;
- `dedication`: days with all dailies done, the target, and whether it is completed;
- `contracts`;
- `asOf`.

Each board carries its period window and `closesAt` instant. Each quest carries id, name, description, reward, verification text, status (`active` · `completed` · `expired`) and progress clamped to its target. `runEngine(...).campaigns` lists every campaign with per-step progress.

## 8. Interpretations and differences

| # | Topic | Status |
| --- | --- | --- |
| Q-1 | "Weighted pick" (GDD §F.3): the catalog defines no weights, so the pick is uniform over the eligible pool. Weights can be added in a later ruleset without changing the seed formula | Interpretation |
| Q-2 | Eligibility is evaluated from facts before the period starts, so a board never depends on activity inside its own period | Interpretation |
| Q-3 | D11 "Quality Pass" is unavailable: check-suite results are not collected. C01 "Ally Assist", C03 "Squad Up" and K9 "Squad Formation" are unavailable: the squad system does not exist. None of them enters a pool | Pending (collector / squad) |
| Q-4 | "Peer review" means a qualifying review: one per PR, on another human's PR (GDD §1.2) | Interpretation |
| Q-5 | The weekly level gate uses EXP with an event day before Monday. A player who reaches level 3 mid-week gets weekly quests from the next week | Interpretation of "unlock at level 3" |
| Q-6 | Boards are frozen at first generation. A late-seen event that changes eligibility for an already written board does not regenerate it (the board is "the same on every rerun", GDD §F.3) | By design |
| Q-7 | Conditions are typed TypeScript predicates, not the YAML DSL of `data-model.md` §8 (same as ADR-0011's ruleset-as-code). Tests bind the catalog values to the docs | Deviation, recorded |
| Q-8 | Ledger ids use `quest|<id>|<period>` rather than `quest.complete|<id>|<period>` (data-model §3 example). The rule field is still `quest.complete` | Deviation, recorded |
| Q-9 | Each run writes bookkeeping entries (boards, closures, expiries, amount 0): about 5 per day. They are not awards and never change balances | Note on ledger growth |
| Q-10 | PD-20 (partial awards at a daily cap) does not affect quests. PD-21 (empty-season reward) concerns season closure; see `season-system.md` | Open (decision register) |

## 9. Tests (`quests.test.ts`, 18 tests)

- **Boards:** seeding by player, period and version, independent of pool order; one frozen board per period with 3 distinct dailies; never regenerated with a different seed; unavailable quests never offered; no weekly quests below level 3.
- **Completion:** once, on the activity day, BP only (EXP and stars unchanged); idempotent under reruns and duplicate events; partial progress does not complete; Dedication on the fifth full day, stacking with dailies.
- **Expiration:** open at 47 h 59 min, closed at 48 h, with `expired` entries; never closed while the guard is down (reported as pending); no completion after closure; weekly closure.
- **Timezone and calendar:** 23:55 WIB and 00:01 WIB land on different player days, although both are 2026-10-20 in UTC; 2026-W53 is one week across the S1/S2 boundary, and its Dedication belongs to S2.
- **Contracts:** 2 per season; expire together with the season closure.
- **Campaigns:** steps in order; pay only on completion; K9 unavailable; never paid twice.
