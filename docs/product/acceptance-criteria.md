# GitHub Legends — Acceptance Criteria

- **Version:** 0.1 · **Date:** 2026-10-20
- Format: Given / When / Then. Each criterion maps to a system (`SYS-xx`) and features (`F-xxx`, see `feature-catalog.md`).
- **Verification method:** unless stated otherwise, criteria are verified with automated tests that use **recorded API fixtures** (no live network) and a fixed clock and timezone (`Asia/Jakarta`). Values below use the default ruleset v1 (PRD §4.3 and §6).
- MVP (P0) criteria are marked **[P0]**.

---

## AC-CORE — Ingestion, ledger, integrity

| ID | Criterion |
| --- | --- |
| AC-CORE-01 **[P0]** | Given the same fixtures and config, when the generator runs twice, then the second run adds no ledger entries and produces byte-identical output files. |
| AC-CORE-02 **[P0]** | Given a commit authored by `github-actions[bot]` (or any `[bot]` login or Bot account) on the default branch, then it produces no EXP, BP, quest progress, battle score or medal progress. |
| AC-CORE-03 **[P0]** | Given a merge commit (two or more parents), then it earns 0 EXP and is recorded as non-qualifying. |
| AC-CORE-04 **[P0]** | Given a commit with 0 additions and 0 deletions, then it earns 0 EXP. |
| AC-CORE-05 **[P0]** | Given commits in a forked repository that are not on the upstream default branch, then they earn nothing. |
| AC-CORE-06 **[P0]** | Given a commit on a non-default branch, then it earns nothing until it appears on the default branch, and then it earns exactly once. |
| AC-CORE-07 **[P0]** | Given the same PR returned by two different queries (search and per-repo list), then exactly one `pr.merged` award exists (keyed by `node_id`). |
| AC-CORE-08 **[P0]** | Given every ledger entry, then it has a non-empty `ruleId`, `ruleVersion`, at least one `sourceKey` or `periodId`, and a kind from the allowed set. |
| AC-CORE-09 **[P0]** | Given 15 qualifying commits on one player day, then commit EXP that day totals 100, and 5 entries carry reason `capped` with amount 0. |
| AC-CORE-10 **[P0]** | Given a commit with author date 10 days ago that is first seen today, then it earns lifetime EXP, but its effective date is (today − 48 h), and it does not count toward any closed day's battle or quest. |
| AC-CORE-11 **[P0]** | Given a repository that existed in an earlier run and has since been deleted, then its previous awards remain, are flagged `source_unavailable`, and no rendered output names it. |
| AC-CORE-12 **[P0]** | Given the GitHub API returns errors for a data source during a run, then no awards are made from partial data for that source, the README footer reports the stale state, and the job exits non-zero. |
| AC-CORE-13 **[P0]** | Given a config file with a schema error, then no config-driven changes (purchases, selections) are applied, previous selections stay, and the error appears in the run summary. |
| AC-CORE-14 **[P0]** | Given the config schema, then it contains no field that sets EXP, BP, level, rank, stars, mastery, medals or hero unlocks. |
| AC-CORE-15 **[P0]** | Given a ruleset version bump that changes an EXP value, then entries created before the bump keep their original amounts and ruleVersion. |
| AC-CORE-16 **[P0]** | Given the initial backfill, then lifetime EXP includes history since account creation; battles and stars exist only for days within the Season 1 quarter; and BP before Season 1 comes only from milestones (levels, medals, heroes). |
| AC-CORE-17 **[P0]** | Given the private contribution count rises from 40 to 52 between runs, then one `private.contribution` award of 48 EXP is created, subject to the 200 EXP weekly cap; and no rendered output names a private repository. |

## AC-SYS01 — Player identity

| ID | Criterion |
| --- | --- |
| AC-SYS01-01 **[P0]** | The Player Card SVG contains the avatar as a data URI and no `http(s)://` references in `href`, `xlink:href` or `url()`. |
| AC-SYS01-02 **[P0]** | Display name, title and motto render with the ✎ marker. Level, rank, BP and streak render as Σ. Login and "player since" render as ✔. |
| AC-SYS01-03 **[P0]** | A display name of 60 characters is truncated to fit the card, and special characters (`<`, `&`, `"`) are escaped. |
| AC-SYS01-04 P1 | Selecting a title that is not in the inventory falls back to the default title and writes a warning. |
| AC-SYS01-05 **[P0]** | Changing the GitHub login (same user ID) keeps all progression. |

## AC-SYS02 — EXP and levels

| ID | Criterion |
| --- | --- |
| AC-SYS02-01 **[P0]** | Cumulative EXP 2,699 → level 9; 2,700 → level 10; 23,200 → level 30; 63,700 → level 50. |
| AC-SYS02-02 **[P0]** | Lifetime EXP ≥ 252,450 → level 100, with the overflow shown. |
| AC-SYS02-03 **[P0]** | Going from level 8 to 11 in one run creates three level-up awards of 25 BP plus one 100 BP award for level 10. |
| AC-SYS02-04 **[P0]** | A merged PR to a repo the player does not own earns 60 EXP. A merged self-owned PR with no review from another user earns 30 EXP. |
| AC-SYS02-05 **[P0]** | Three reviews by the player on the same PR earn exactly one `pr.review` award (25 EXP). |
| AC-SYS02-06 **[P0]** | Displayed EXP equals the sum of ledger EXP entries. |

## AC-SYS03 — Rank

| ID | Criterion |
| --- | --- |
| AC-SYS03-01 **[P0]** | Season stars 0 → Initiate III; 9 → Squire III; 18 → Knight III; 30 → Warden III; 42 → Champion III; 57 → Paragon III; 72 → Ascendant; 92 → Eternal (0 stars shown); 100 → Eternal ★8. |
| AC-SYS03-02 **[P0]** | In a 30-day period with no activity, rank and stars do not change. |
| AC-SYS03-03 **[P0]** | Reaching Knight for the first time in a season awards 50 BP once; reaching it again in the same season (impossible without demotion) or rerunning awards nothing. |

## AC-SYS04 — Battle Points

| ID | Criterion |
| --- | --- |
| AC-SYS04-01 **[P0]** | The BP balance equals the sum of BP ledger entries (positive and negative). |
| AC-SYS04-02 **[P0]** | A commit worth 10 EXP produces 2 activity BP. |
| AC-SYS04-03 **[P0]** | When activity plus battle BP in an ISO week reaches 700, further activity and battle BP that week are recorded as 0 with reason `weekly_cap`. Quest, medal and milestone BP are still awarded. |
| AC-SYS04-04 P1 | With a balance of 300, purchases A (200) then B (150) in the same run: A settles, B is rejected with `insufficient_bp`, and the final balance is 100. |
| AC-SYS04-05 P1 | Rerunning after a settled purchase does not charge again (requestId consumed). |
| AC-SYS04-06 P1 | A duplicate requestId in config is ignored with a warning. |
| AC-SYS04-07 P1 | Removing a settled purchase line from config does not refund BP or remove the item. |
| AC-SYS04-08 P1 | A purchase of an item gated at level 15 by a level-14 player is rejected with `requirement_not_met`. |
| AC-SYS04-09 P1 | The shop catalog contains no item that grants EXP, stars, mastery, medals or hero unlocks. |

## AC-SYS05 / SYS06 — Heroes and mastery

| ID | Criterion |
| --- | --- |
| AC-SYS05-01 **[P0]** | A technology with weighted usage 99 stays `discovered`; at 100, with ≥ 10% share in a repo with ≥ 5 qualifying player commits, it becomes `unlocked` and awards 50 BP once. |
| AC-SYS05-02 **[P0]** | A technology present only in forks has weighted usage 0. |
| AC-SYS05-03 **[P0]** | Selecting a main hero that is not unlocked falls back to the highest-mastery hero, with a warning. |
| AC-SYS05-04 **[P0]** | Hiding a hero removes it from the README lineup but does not change its mastery, unlock state or medal progress. |
| AC-SYS05-05 **[P0]** | A detected language with no catalog hero appears as "Unknown Spirit (<language>)". |
| AC-SYS06-01 **[P0]** | For any ledger, Σ mastery points across heroes ≤ Σ commit EXP. |
| AC-SYS06-02 **[P0]** | A repository whose language share changes after an award does not change MP from earlier awards. |
| AC-SYS06-03 **[P0]** | MP 999 → Novice; 1,000 → Adept; 50,000 → Exalted. |
| AC-SYS06-04 **[P0]** | The hero lineup includes the caption stating that mastery reflects verified activity volume, not assessed skill. |

## AC-SYS07 — Emblems (P1)

| ID | Criterion |
| --- | --- |
| AC-SYS07-01 | With Integrator active, a merged PR worth 60 EXP gives activity BP floor(12 × 1.15) = 13; quest, medal and milestone BP are unaffected. (Rounding rule: floor after the multiplier.) |
| AC-SYS07-02 | Changing the active emblem 3 days after the last change is ignored, with a warning. |
| AC-SYS07-03 | Selecting an emblem the player does not own leaves the previous emblem active. |
| AC-SYS07-04 | Workflow runs triggered by `schedule` or by a bot actor do not count toward the Operator emblem. |

## AC-SYS08 — Equipment (P1)

| ID | Criterion |
| --- | --- |
| AC-SYS08-01 | A declared tool cannot be placed in the build. It appears only in the "Declared kit" row with ✎. |
| AC-SYS08-02 | Equipping 6 items without the purchased slot keeps the first 5 and warns. |
| AC-SYS08-03 | Item tier is Common at 1 eligible repo, Rare at 3, Epic at 6, and Legendary at 10 with use in the last 90 days. |
| AC-SYS08-04 | Equipped items do not change any EXP or BP amount. |

## AC-SYS09 — Quests

| ID | Criterion |
| --- | --- |
| AC-SYS09-01 **[P0]** | For a fixed player ID, date and ruleset version, the daily board is identical across runs and machines. |
| AC-SYS09-02 **[P0]** | A commit at 23:50 local time counts toward that day's quests. A commit at 00:10 counts toward the next day. |
| AC-SYS09-03 **[P0]** | Completing "First Blood" twice in a day awards 10 BP once. |
| AC-SYS09-04 **[P0]** | An event first seen after a day's 48 h closure does not complete that day's quests, and the quests stay `expired`. |
| AC-SYS09-05 **[P0]** | A player with no reviews in the last 90 days is never assigned a review quest. |
| AC-SYS09-06 **[P0]** | Quest completion awards BP and no EXP. |
| AC-SYS09-07 **[P0]** | Weekly quests do not appear below level 3. |
| AC-SYS09-08 **[P0]** | The quest board shows "as of <timestamp>" in the player's timezone. |

## AC-SYS10 — Medals

| ID | Criterion |
| --- | --- |
| AC-SYS10-01 **[P0]** | Every earned medal stores at least one evidence key and an earned-on date equal to the date of the qualifying event. |
| AC-SYS10-02 **[P0]** | The bronze tier of "Commits" (100) is awarded exactly once; reruns and backfill do not repeat it. |
| AC-SYS10-03 **[P0]** | A medal cannot be granted from the config. Hiding a medal only removes it from the README. |
| AC-SYS10-04 **[P0]** | Medal and README labels never use the word "Achievements". The hand-written "🏆 Achievements" section is byte-identical after every run. |
| AC-SYS10-05 **[P0]** | Hidden medals render as "???" until earned. |

## AC-SYS11 — Seasons

| ID | Criterion |
| --- | --- |
| AC-SYS11-01 **[P0]** | Season closure runs once, at least 48 h after the season ends. A second run creates no new season-end awards. |
| AC-SYS11-02 **[P0]** | Soft reset: Eternal → Paragon III (57 stars); Ascendant → Champion III; Paragon → Warden III; Champion → Knight III; Warden → Squire III; Knight or lower → Initiate III. |
| AC-SYS11-03 **[P0]** | Peak-tier season BP matches the PRD table and a permanent season badge with the peak tier is recorded. |
| AC-SYS11-04 **[P0]** | If the generator does not run for 5 days across a season boundary, the next run closes the old season once and opens the new one with the correct reset rank. |

## AC-SYS12 — Squad (P1)

| ID | Criterion |
| --- | --- |
| AC-SYS12-01 | Logins in `squad.hide` never appear in any output. |
| AC-SYS12-02 | Bot accounts are never allies. |
| AC-SYS12-03 | An interaction 91 days old does not count toward synergy. |
| AC-SYS12-04 | No progression data of other users is fetched or rendered. |

## AC-SYS13 — Battles

| ID | Criterion |
| --- | --- |
| AC-SYS13-01 **[P0]** | Day score 29 → Skirmish, 0 stars; 30 → Victory, +1 star, 15 BP; 120 with a merged PR → MVP, +2 stars, 30 BP; 120 with commits only → Victory. |
| AC-SYS13-02 **[P0]** | A day with no qualifying activity creates no battle entry. |
| AC-SYS13-03 **[P0]** | Battles older than 90 days remain in history after the API no longer returns their events. |
| AC-SYS13-04 **[P0]** | A highlight from a private repository never renders. |

## AC-SYS14 — Records (P1)

| ID | Criterion |
| --- | --- |
| AC-SYS14-01 | A tie with the current record does not replace it. |
| AC-SYS14-02 | The season ladder ranks seasons by stars, with the current season highlighted. |
| AC-SYS14-03 | No other user's data appears in any leaderboard. |

## AC-SYS15 — World map (P1)

| ID | Criterion |
| --- | --- |
| AC-SYS15-01 | The player marker sits at the furthest cleared checkpoint on the main path. |
| AC-SYS15-02 | Locked checkpoints show their condition text. |
| AC-SYS15-03 | The map SVG is self-contained, < 100 KB, and legible at 400 px width. |

## AC-SYS16 — README integration

| ID | Criterion |
| --- | --- |
| AC-SYS16-01 **[P0]** | Content outside `<!-- LEGENDS:START -->` / `<!-- LEGENDS:END -->` is byte-identical before and after a run. |
| AC-SYS16-02 **[P0]** | With missing, duplicated or reversed markers, README.md is not modified and the step fails with an explanatory message. |
| AC-SYS16-03 **[P0]** | A run with no state change produces no commit. |
| AC-SYS16-04 **[P0]** | Every `<img>` in the block has non-empty alt text; level, rank and season appear in plain text. |
| AC-SYS16-05 **[P0]** | Light and dark variants are delivered via `<picture>` with `prefers-color-scheme` sources. |
| AC-SYS16-06 **[P0]** | The README block is < 15 KB, each SVG < 100 KB, and total generated assets < 1 MB. |
| AC-SYS16-07 **[P0]** | If the last successful data refresh is more than 3 days old, the footer shows the stale-data warning with the date. |
| AC-SYS16-08 **[P0]** | A section disabled in config does not render, and other sections are unaffected. |
| AC-SYS16-09 **[P0]** | The footer contains the provenance legend and a link to the "How it works" page. |

## MVP acceptance gate

1. All **[P0]** criteria pass in CI on recorded fixtures.
2. Seven consecutive scheduled live runs on the profile with: no failed runs caused by the generator, no double awards (ledger idempotency audit), no changes outside markers, and a README refresh each day.
3. The owner reviews the rendered profile (light and dark, desktop and mobile width) and signs off.
