# GitHub Legends — Achievement System (Medals)

- **Phase:** 08 (implementation) · **Date:** 2026-10-20 · Ruleset `1.0.0`
- **Code:** `legends/src/engine/medals.ts` (catalog and engine), `legends/src/engine/facts.ts` (verified facts)
- **Tests:** `legends/test/engine/medals.test.ts`
- **Spec:** GDD §G, `achievement-catalog.md` §1–§3, PRD STK-5/STK-7, INT-4/INT-6
- **Companions:** `quest-system.md`, `season-system.md`

In the product, achievements are called **Medals** (INT-6). A medal shows that a verified activity threshold was reached. It never claims anything about code quality or expertise.

## 1. Medal definition

| Field | Meaning |
| --- | --- |
| `id`, `name` | Stable catalog id (`M-001`…`M-104`) and name |
| `tiers[]` | `{tier, rarity, evaluate}`. Single medals use tier `-`; families use `I`…`IV` |
| `perSeason` + `perSeasonRarity` | Repeatable medals: one tier per season (`S1`, `S2`, …) |
| `prerequisites` | Other medals that must already be earned (any tier). Each tier of a family also needs the previous tier |
| Completion condition | `evaluate(ctx)` returns `{current, target, completedOn, evidence}`. It is a pure function of the ledger, verified facts and season state |
| Reward | From rarity (§2) |
| Unlock timestamp | `effectiveDay` = **earned-on date**, the day of the qualifying event. `createdAt` = the run that recorded it |
| `provenance` | The ledger rules and event types the condition reads, stored with the award (verification provenance) |
| `hidden` | Hint text. The view shows `???` and the hint until the medal is earned |
| `available` / `unavailableReason` | Medals whose data or system does not exist yet are never evaluated |

## 2. Rarity and rewards (approved values, unchanged)

| Rarity | BP | Cosmetic class |
| --- | --- | --- |
| Common | 25 | — |
| Uncommon | 50 | — |
| Rare | 100 | `title_or_badge_style` |
| Epic | 200 | `frame` |
| Legendary | 400 | `animated_frame` |

Rarity is a design target for one player, not a population statistic (GDD §G.1). Medal BP is a milestone reward (STK-7): it stacks with activity BP and is outside the 700 BP weekly cap. Medals never grant EXP (STK-5).

## 3. Award and distribution

For each newly satisfied tier whose prerequisites hold, `runMedals` writes:

| Entry | Id | Contents |
| --- | --- | --- |
| Medal | `medal|<id>|<tier>` (kind `medal`, rule `medal.earned`, amount 0) | `meta.medal`, `tier`, `rarity`, `evidence` (up to 5 keys), `provenance`; `effectiveDay` = earned-on date; `season` of that date |
| Reward | `bp.medal|<id>|<tier>` (kind `bp`, rule `bp.medal`) | Rarity BP, plus `meta.cosmetic` for Rare and above, on the same day |

- **No duplicates:** the ids are idempotency keys. Reruns, backfill and duplicate events cannot award a tier twice (achievement-catalog §3).
- **Never revoked:** a medal whose source later disappears stays earned (INT-4). The ledger is append-only.
- **Configuration cannot grant medals:** no config field reaches a condition. M-080 reads the build only to choose among items that are already verified at Rare.
- **Two passes per run:** medals are evaluated before season closure, and again after it for medals that need a closed season (M-023, M-034, M-035, M-101).

## 4. Verification rules

- Every condition reads the facts index (`quest-system.md` §1), so only **qualifying** activity counts: bots, spam beyond the daily curve, flagged automation, duplicates and invalid timestamps are already removed. M-010 counts only commits that earned EXP.
- Events whose latest revision is `unverifiable` are dropped before any award (`prepareEvents`, diagnostic `unverifiable_event`). This also applies to calendar days: an unverifiable day breaks a streak.
- Calendar days arrive as `partial` (`calendar_timezone_unconfirmed`). They are accepted for streaks only, as the catalog specifies "GitHub's own count".
- The earned-on date comes from the evidence, not the run. For example, a first commit on 5 October noticed on 25 October is earned on 5 October and recorded at the 25 October run.

## 5. Catalog coverage

All 55 catalog medals are defined. 51 are evaluated; four are unavailable:

| Medal | Reason |
| --- | --- |
| M-064 Squad of Four | The squad system is not implemented |
| M-090 Explorer, M-091 Pathfinder, M-092 Cartographer | The world map is not implemented |

Repeatable: **M-036 "S<n> Contender"** is awarded once per season in which every contract on that season's board was completed. Tier = season id; earned-on = the last contract's completion day.

## 6. Interpretations and differences

| # | Medal | Interpretation |
| --- | --- | --- |
| A-1 | M-002 | "Victory or MVP battle" uses the Victory record. An MVP day always has score ≥ 100, so it is also a Victory |
| A-2 | M-011 | Self-merged PRs count at most one per day. External merges always count |
| A-3 | M-021 | Weekly stars are summed from star entries (overflow stars beyond the cap have amount 0). Earned on the last star day of the fourth consecutive full week |
| A-4 | M-022 | The first season, in date order, that reaches 60 battles |
| A-5 | M-023 | Needs a **closed** season with ≥ 30 battles and no Skirmish. Earned on the season's last day |
| A-6 | M-030…M-033 | The day the tier was first held (gated stars) in any season. A gated tier is held only after its trial, so "Champion (trial completed)" holds by construction |
| A-7 | M-034, M-101 | Use the `peakTier` frozen in `season.close`. Ranks never drop within a season, so final tier = peak tier |
| A-8 | M-035 | "4 season badges" = 4 closed seasons. Every closed season produces a badge |
| A-9 | M-045 | Hero repos use the latest language snapshot (share ≥ 10%), the same as quests |
| A-10 | M-061 | 10 external merges **and** ≥ 3 distinct external repos; earned on the later of the two dates |
| A-11 | M-072 | Needs all 10 campaigns. K9 needs the squad system, so M-072 cannot be earned until that exists |
| A-12 | M-080 | The build has no event date, so the earned-on date is the run day on which the 5th verified Rare+ item was equipped |
| A-13 | M-040…M-044, M-050…M-054, M-081, M-082 | Hero unlocks, mastery tiers, emblem levels and item tiers are recorded on the run day that detects them (Phase 07). Medals built on them inherit that day |
| A-14 | M-102 | Saturday/Sunday by the player's **effective** day in Asia/Jakarta |
| A-15 | M-103 | Trial met within the last 7 days of a season (`endDay − 6` … `endDay`) |
| A-16 | All | A medal earned on a day inside a season that has already closed keeps that earned-on date and season id, but the frozen archive is not changed (`season-system.md` §3) |
| A-17 | All | Conditions are typed code, not the YAML DSL of data-model §8 (ADR-0011 ruleset-as-code); config `medals.hide` is a renderer concern and is not read by the engine |

## 7. Output

`runEngine(...).medals` is the medal book: one row per tier (per season for M-036), with:

- `id`, `name` (`???` while hidden and unearned), `tier`, `rarity`;
- `earned`, `earnedOn`, `recordedAt`;
- `hidden`, `hint`;
- `progress` (current/target/evidence);
- `provenance`, `available`.

## 8. Tests (`medals.test.ts`, 17 tests)

- **Catalog:** unique ids from M-001 to M-104; prerequisites reference real medals; the exact rarity table; unavailable medals never awarded.
- **One-time medals:**
  - earned-on date vs recorded-at time, season id, evidence and provenance;
  - once per tier under reruns and duplicate events;
  - rarity BP and cosmetic class for every earned medal;
  - tiers in order, prerequisites respected, Committed I on the day of the 100th commit;
  - capped commits never count;
  - Peer Reviewer needs distinct authors.
- **Verification:** unverifiable events give no EXP and no medals (diagnostic counted); streaks from the calendar, broken by an unverifiable day; configuration cannot unlock medals.
- **Hidden medals:** `???` plus hint until earned; Phoenix at ≥ 30 empty days, not at 29.
- **Repeatable:** S1 and S2 Contender, each paid once (50 + 50 BP); not earned with one contract done.
- **Anti-manipulation:** 40 days of commits alone never reach Champion.
