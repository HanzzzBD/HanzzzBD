# GitHub Legends — Season System (Boundaries, Archives, Scheduling)

- **Phase:** 08 (implementation) · **Date:** 2026-10-20 · Ruleset `1.0.0`
- **Code:** `legends/src/engine/seasons.ts` (archives, views, schedule), `legends/src/engine/progression.ts` (`progressSeasons`), `legends/src/engine/time.ts`, `legends/src/engine/engine.ts` (orchestration)
- **Tests:** `legends/test/engine/seasons.test.ts`; boundary cases also in `quests.test.ts`
- **Spec:** GDD §A.3–A.6 and §H, PRD §4.4 and §10, architecture §12
- **Companions:** `game-engine.md` (rank, stars, soft reset), `quest-system.md`, `achievement-system.md`

## 1. Boundaries and calendar rules

- **Timezone:** every day, week and season boundary uses `config.timezone` (Asia/Jakarta, PD-05). Player days are computed with `Intl` (`dayOf`, `dayStart`), never with UTC dates. An event at 00:01 WIB belongs to the new day even though it is still the previous day in UTC.
- **Weeks:** ISO weeks, Monday 00:00 to Sunday 23:59:59 local. 2026 has 53 ISO weeks: **2026-W53 runs from 28 Dec 2026 to 3 Jan 2027 and straddles Season 1 and Season 2.** It is one quest week (one weekly board, one Dedication); each entry's season comes from its own day.
- **Seasons:** calendar quarters starting at `season1Start` (`2026-10-01`, the first day of a quarter; validated by `assertSeason1Start`). S1 runs from 2026-10-01 to 2026-12-31, S2 from 2027-01-01 to 2027-03-31, and so on.
- **Effective dates:** awards land on `max(event day, day of firstSeenAt − 48 h)` (PRD §4.4). A backdated or late-seen event can never enter a closed season.

## 2. Lifecycle and closure

`upcoming → active → closing → closed` (GDD §H.2).

A season is **closable** once `runAt ≥ start of the next season + 48 h`. It **closes** only if the run's `closureAllowed` guard is also true, meaning every source the season depends on was collected completely. Closure writes, once:

| Entry | Contents |
| --- | --- |
| `season.close|S<n>` (kind `season`) | Final stars, peak tier, raw stars, banked stars, start stars, and the frozen archive summary (§3) |
| `bp.season_end|S<n>` | BP by peak tier (Initiate 100 … Eternal 1,000; unchanged) |

After closure the season is immutable:

- `progressSeasons` reads the recorded final stars to compute the next season's soft reset;
- it never re-derives a closed season;
- it never writes first-time tier BP into it.

Season contracts close with the season (`quest-system.md` §5).

**Order inside one run** (`runEngine`):

1. EXP, objectives and battles.
2. Seasons without closure.
3. Heroes, emblems and equipment.
4. Facts.
5. Quests, campaigns and medals.
6. **Season closure with the archive.**
7. Campaigns and medals again, for those that need a closed season.
8. Activity, battle and level BP.
9. Corrections.

Because closure comes after the quests and medals of the season, the archive includes them.

## 3. Archived season records (frozen)

The archive is stored **inside** `season.close` (`meta`, `archiveVersion: 1`). It is computed once, at the moment of closure, and is never recomputed. `seasonArchives(ledger)` only reads those entries back, so later runs, late events, rule changes and ledger growth cannot alter an archive (GDD §H.4: "Archives are never rewritten").

| Field | Meaning |
| --- | --- |
| `finalStars`, `peakTier`, `finalRank` | Final position. Ranks never drop within a season, so final = peak |
| `starsEarned`, `banked`, `trialsCompleted` | Stars from battles, banked stars lost at closure, trials met this season |
| `battles`, `victories`, `mvps`, `skirmishes`, `bestScore` | Battles by result, and the best daily score |
| `expEarned` | EXP with effective days in the season |
| `bpEarned`, `bpSpent` | Positive and negative BP entries in the season (season-end BP excluded) |
| `dailyQuests`, `weeklyQuests`, `specialtyQuests`, `contracts` | Quests completed |
| `medals`, `medalIds` | Medal tiers earned in the season (`M-001:-,…`) |
| `topHeroes` | Top 3 heroes by mastery points gained in the season (`syntaria:288,…`), using the same EXP × byte-share split as mastery |
| `emblemMostUsed` | The emblem active on the most days of the season |
| `seasonFrame` | Season frame cosmetic, true for Champion and above (GDD §H.3) |

The archive view adds the season number, dates, `closedAt` (run instant), `rulesVersion` and `seasonEndBp`. The season **badge** is the archive itself; every closed season has one.

## 4. Lifetime, current season and archives

`runEngine(...).records` (`SeasonsView`) keeps the three layers separate:

| View | Contents | Reset at season end? |
| --- | --- | --- |
| `lifetime` | EXP, level, BP balance, BP earned/spent, medals, quests completed, campaigns completed, seasons archived, best peak tier | **Never** |
| `current` | Season id, dates, days left, stars, rank label, and this season's live stats (same fields as the archive, up to today) | Replaced by the next season |
| `archived[]` | Frozen archives in season order | Never changed |

Ending a season touches only seasonal state: stars soft-reset by the 3-tier rule (`game-engine.md`). EXP, level, BP, medals, campaigns, mastery, emblems and equipment carry over unchanged (GDD §H.5).

## 5. Scheduled evaluation

The engine is **time-driven, not commit-driven.** Every run receives one clock reading (`runAt`) and evaluates every open period from Season 1 to that instant. Consequences:

- **No dependence on commits.** Boards appear, quests complete, periods expire and seasons close because time passed. No commit is needed at the right moment.
- **Catch-up.** A missed or late run delays rewards but never loses them. A single run after several missed days writes the same rewards, on the same days, as daily runs would. This is tested, including Dedication.
- **Idempotent.** A run repeated with its own ledger adds nothing.
- **Guarded.** Closure waits for the 48 h grace and for complete source data. A run with incomplete sources still awards what it can, but closes nothing.

`runEngine(...).schedule` (`ScheduleView`) gives the scheduler and the README what they need:

| Field | Meaning |
| --- | --- |
| `today`, `timezone`, `asOf` | The player day of this run |
| `nextDayStartsAt`, `nextWeekStartsAt`, `nextSeasonStartsAt` | The next local boundaries, as UTC instants |
| `pending[]` | Periods past their end but not closed: `{kind, period, closesAt, waitingFor: "grace" | "source_completeness"}` |

**Recommended schedule** (architecture §12): daily at `17 17 * * *` UTC (00:17 WIB, off the hour), plus manual `workflow_dispatch`. With a 48 h grace, a day closes on the third daily run after it.

The GitHub Actions workflow (`legends.yml`) is **not created in this phase**. It needs the CLI entry point, state store and publish steps, which are not implemented yet (`data-collection.md` §10). Adding a scheduled workflow now would run a command that does not exist.

## 6. Interpretations, differences and open items

| # | Topic | Status |
| --- | --- | --- |
| S-1 | The archive lives in the `season.close` ledger entry. The separate `seasons/S<n>.json` file and the rendered `docs/legends/seasons/S<n>.md` (GDD §H.4) need the state store and renderer; they will be written from this frozen record | Pending (store/renderer) |
| S-2 | "Personal records broken" (GDD §H.4) needs the personal-records system, which does not exist yet | Pending |
| S-3 | `bpSpent` is always 0 until the shop and purchases exist | Pending (shop) |
| S-4 | "Top 3 heroes by MP gained" counts heroes with ≥ 1 MP gained, from commit credits whose EXP entry has an effective day in the season | Interpretation |
| S-5 | Medals detected after a season closed keep their earned-on date and season id, but the archive is not changed | By design (immutability) |
| S-6 | PD-21 (season-end reward for a season with no activity) is still open; the engine pays the Initiate amount (100 BP), as before | Open (decision register) |
| S-7 | A ledger rebuild that would change an archive is not implemented. Archives cannot be rewritten by normal runs | Pending (PRD §8 rebuild tool) |

## 7. Tests (`seasons.test.ts`, 10 tests)

- **Boundaries:** 23:5x WIB on 31 Dec is in S1 and 00:0x WIB on 1 Jan is in S2; no closure 1 minute before the grace ends, none while the guard is down, closure at the grace instant.
- **Archives:**
  - frozen summary fields (battles, results, EXP, quests, medals and their ids, final rank and stars);
  - top heroes by MP gained (80/20 byte split gives 288/72), and no frame below Champion;
  - unchanged by later events, reruns and a later season;
  - a late-seen S1 commit is credited in S2.
- **Lifetime:** EXP, level, medals and BP survive the season end; current stars soft-reset; the new season's stats start empty; medals and campaigns are kept after closure.
- **Schedule:** next day, week and season boundaries in WIB; pending periods waiting for grace or for the guard; one late catch-up run equals daily runs.

Boundary tests in `quests.test.ts` cover local midnight and the 2026-W53 straddle.
