# GitHub Legends — Economy Balancing

- **Version:** 0.1 · **Date:** 2026-10-20 · Ruleset `v1`
- **Method:** numbers come from a deterministic spreadsheet-style model of the rules in `game-design-document.md`, run over 4 seasons (13 weeks each) for representative weekly activity patterns. The model is an analysis aid, not engine code, and is not committed. Quest BP is an expected value over board draws (±20%). All profiles assume **every week looks the same**; real players have gaps, so these are upper bounds for the given pattern.

## 1. Principles

1. **EXP = long-term progress.** Earned only from qualifying activity, never spent, never decreases.
2. **BP = reward currency.** Earned from play, spent on things that make no claims about activity or expertise.
3. **Stars = seasonal standing.** Earned only from battles, capped weekly, and gated by trials that need verified objectives.
4. **No double rewards without a rule.** Stacking rules STK-1 to STK-11 (PRD §4.2, GDD §F.6).
5. **Volume is not quality.** No value in this economy claims code quality. More activity means more verified activity, nothing more. Diminishing returns and caps keep extra volume from paying off, and high-signal events (other people reviewing, merging, or asking for fixes) carry the top rewards because they show **collaboration**, not because they prove quality.

## 2. EXP table and rationale

| Activity | EXP | Daily limit | Rationale |
| --- | --- | --- | --- |
| Commit #1–5 of the day | 10 each | — | The base unit of steady work. 5 meaningful commits a day is a productive day. |
| Commit #6–10 of the day | 5 each | — | Diminishing returns: more commits rarely mean more value. |
| Commit #11+ of the day | 0 | Max 75/day from commits | Stops volume farming. Reached by real devs only on unusual days. |
| Empty, merge, duplicate, bot or automation-flagged commit | 0 | — | Not new authored work (GDD §1.5–1.6) |
| PR merged, self-owned, no review from another human | 15 | 2 rewarded/day | Integration still matters solo, but self-merges are scriptable |
| PR merged with an approving review from another human, or into someone else's repo | 60 | PR total 150/day | Another person accepted the work: the strongest public signal of collaboration |
| Peer review given (another human's PR) | 25 | 100/day | Reviewing is valuable, often invisible work. Once per PR (STK-3). |
| Issue opened | 10 | 30/day | Reporting helps. Kept low because issues are cheap to create. |
| Issue resolved (closed as completed by the player, own repo) | 15 | 45/day | Finishing work. Not-planned closures give 0. |
| Release published (qualifying) | 50 (prerelease 20) | 100/day; 1 per repo per 7 days | Shipping. Needs ≥ 3 qualifying commits since the last release. |
| Private contributions (aggregate) | 4 per contribution | 200/ISO week | Credits private work without details (D-02). Lower rate because it can't be deduplicated or filtered for quality. |

**Why commits are not weighted by lines changed:** line counts reward verbosity, generated code and churn. A size-neutral commit unit, plus diminishing returns, removes the incentive to inflate diffs or split them.

## 3. BP tables and rationale

### 3.1 Sources

| Source | BP | Limit | Rationale |
| --- | --- | --- | --- |
| Activity BP | floor(20% of EXP) | Weekly cap 700 (shared with battles) | Ties BP to real work, at a fraction so quests stay the main BP loop |
| Victory / MVP | 15 / 30 | Weekly cap (shared) | Rewards showing up and having a good day |
| Daily quests | 10–25 each | 3 per day | Short goals. About 30–60 BP on a good day. |
| Weekly quests | 80–150 each | 3 + 1 specialty | Medium goals that steer behaviour (reviews, releases) |
| Dedication | 50 | Weekly | Rewards ≥ 5 days with all dailies done |
| Season contracts | 200–400 | 2 per season | Long goals |
| Milestone campaigns | 100–500 | One-time | Guided onboarding into each system |
| Medals | 25–400 | One-time | Collection |
| Level-ups | 25 (+100 every 10th) | — | Milestone (STK-7) |
| Tier first reached (season) | 30–400 | Per season | Climbing feels rewarding every season |
| Season end | 100–1,000 | Per season | Peak-tier reward |
| Hero unlock / mastery tiers | 50 / 30–500 | One-time | Collection depth |
| Emblem levels | 20 × level | One-time per level | Specialisation |
| Equipment tiers | 20 / 50 / 100 | One-time | Toolchain growth |
| New verified ally | 10 | 50/week | Encourages collaboration without making it farmable |

### 3.2 Sinks

| Sink | Price | Purpose |
| --- | --- | --- |
| Titles, badge styles | 200–400 | Cheap early wins |
| Frames, hero palette skins | 600–1,200 | A weekly purchase for active players |
| Patterned skins, map themes | 1,500–3,000 | A multi-week goal |
| Legendary cosmetics | 4,000–6,000 | Long-term goal |
| Emblem attunement | 500 each (6 × 500 = 3,000 total) | Specialisation choices |
| 6th build slot | 1,500 | One-off utility |
| Season Vault frame | 2,500, tier-gated | Seasonal urgency (limited-time) |

**Catalog depth at launch:** about 40 cosmetic items averaging about 1,500 BP ≈ 60,000 BP, plus utilities (≈ 4,500), plus a new Season Vault item each season. That is about 2 years of spending for an active student. A catalog refresh every season keeps the sink alive.

## 4. Scenario simulations

### 4.1 Profiles (one representative week, repeated)

| Profile | Weekly pattern |
| --- | --- |
| **A. New developer** | 3 active days: 2–3 commits a day; 1 issue opened. No PRs or reviews. |
| **B. Active student** | 6 active days: 3–6 commits a day; 2 self-merged PRs; 1 PR reviewed by a teammate; 1 review given; 1 issue resolved. |
| **C. Multi-repo maintainer** | 6 active days: 4–8 commits a day; 7 reviews given; 4 community issues resolved; 2 self-merged PRs; 1 release. |
| **D. Open-source contributor** | 5 active days: 1–4 commits a day; 2 PRs merged into others' repos; 3 reviews; 2 issues opened. |
| **E1. Automation, undetected** | 4 tiny scripted commits every day via the player's own token, never caught by detection (worst case). |
| **E2. Automation, detected or bot-authored** | Bot commits (0) or a flagged repo (0), plus 1 real day with 2 commits. |
| **F. Spam attack** | 5,000 one-line commits a day plus 2 scripted self-merged PRs a day (undetected worst case). |

### 4.2 Results — Season 1 (from Initiate III)

| Profile | Season EXP | Level after S1 | Battles V / MVP | Stars earned (cap) | Objectives (contested) | **Final rank S1** | Activity + battle BP | Quest BP (est.) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A New dev | 1,040 | 6 | 26 / 0 | 26 | 0 (0) | **Knight I** | 598 | ≈ 1,770 |
| B Student | 5,135 | 13 | 65 / 13 | 65 | 26 (26) | **Paragon II** | 2,392 | ≈ 5,600 |
| C Maintainer | 8,450 | 17 | 26 / 52 | 65 | 156 (143) | **Paragon II** | 3,640 | ≈ 6,700 |
| D OSS contributor | 4,225 | 12 | 65 / 0 | 65 | 65 (65) | **Paragon II** | 1,820 | ≈ 5,200 |
| E1 Automation (undetected) | 3,640 | 11 | 91 / 0 | 65 (24 banked) | 0 | **Warden I** (trial-blocked) | 2,093 | ≈ 5,700 |
| E2 Automation (detected) | 260 | 3 | 0 / 0 | 0 | 0 | **Initiate III** | 52 | ≈ 1,000 |
| F Spam (undetected) | 9,555 | 19 | 91 / 0 | 65 (24 banked) | 0 | **Warden I** (trial-blocked) | 3,276 | ≈ 5,700 |
| F Spam (detected, expected) | ≈ 0 | — | — | — | 0 | **Initiate III** | ≈ 0 | ≈ 0 |

### 4.3 Results — four seasons (steady state)

| Profile | Rank S1 → S2 → S3 → S4 | Level after 1 year |
| --- | --- | --- |
| A New dev | Knight I → Knight I → Knight I → Knight I | 12 |
| B Student | Paragon II → Ascendant ★11 → **Eternal ★3** → Eternal ★15 | 28 |
| C Maintainer | Paragon II → Ascendant ★11 → Eternal ★3 → Eternal ★15 | 36 |
| D OSS contributor | Paragon II → Ascendant ★11 → Eternal ★3 → Eternal ★15 | 25 |
| E1 Automation (undetected) | Warden I every season | 23 |
| F Spam (undetected) | Warden I every season | 38 |

### 4.4 Interpretation

- **Rank cannot be bought with volume.** Thousands of commits a day give at most 1 star a day (score ≥ 30, but no contested objective, so no MVP), at most 5 stars a week, and **no promotion beyond Warden I** without contested objectives involving other human accounts. Empty commits earn 0 (filter). Duplicate commits earn 0 (key and fingerprint).
- **Eternal is a "perfect-week" tier.** B, C and D reach Eternal only by hitting the 5-star cap **every single week** for a whole season, starting from Warden III after an Ascendant season, *and* completing the Eternal trial. The model has no holidays. A **sensitivity check**: student B with 4 inactive weeks (exams) earns about 45 stars, which is about Champion III in S1. It then restarts each season at Squire III and ends near Champion II: a stable upper-mid rank, not Eternal.
- **Profiles converge at the top by design.** B, C and D reach the same rank: rank measures **consistency plus collaboration** within a season, not output. The maintainer's larger output shows up in **lifetime** progress (level 36 against 28) and in Open Source and Backend emblem levels. Because of the weekly cap, the maintainer's extra MVPs fill the 5 stars sooner and do not add more.
- **The new developer is not shut out.** Three short active days a week give Knight, two tiers of first-time BP every season and a meaningful season-end reward. Raising activity to 5 days a week reaches Champion once the first contested objective happens (one reviewed PR or one review).
- **The residual risk is lifetime EXP.** An undetected spammer reaches level 38 in a year (comparable to the maintainer). Level is volume-sensitive by nature, which is why the README never presents it as a quality signal, why automation detection exists, and why the stronger claims (rank tiers above Warden, MVPs, Eternal, the Open Source emblem) need other humans.

### 4.5 BP flow per week (steady state, estimates)

| Profile | Activity + battle | Quests (est.) | Milestones (avg/week, S1) | **Total ≈** | Can afford |
| --- | --- | --- | --- | --- | --- |
| A New dev | 46 | 136 | ≈ 50 | **≈ 230** | A Basic item every 1–2 weeks; a Rare item a month |
| B Student | 184 | 430 | ≈ 115 | **≈ 730** | A Rare item a week, or an Epic item every 2–3 weeks |
| C Maintainer | 280 | 515 | ≈ 130 | **≈ 925** | An Epic item every 2 weeks |
| D OSS | 140 | 400 | ≈ 110 | **≈ 650** | Similar to B |
| E1 Automation (undetected) | 161 | ≈ 440 | ≈ 40 | ≈ 640 | Cosmetics only (no claims purchasable) |

The weekly cap (700) is never reached by real profiles from activity and battles alone (the maximum observed is about 280). It exists to bound worst-case farming, not to restrict normal play.

## 5. Abuse matrix

| Attack | Effect without controls | Control | Residual |
| --- | --- | --- | --- |
| Thousands of empty commits | Unlimited EXP | Empty-commit filter (additions + deletions = 0) | None |
| Thousands of one-line commits | Unlimited EXP and stars | Diminishing returns (75/day), micro-flood detection, weekly star cap, trials | Lifetime EXP if undetected (§4.4) |
| Rebase or cherry-pick re-pushes | Double EXP | SHA idempotency + fingerprint dedupe | Edited-message rebases inside 30 days may pass (small) |
| Bot or Actions commits | Free EXP | Bot actor filter; generator commits excluded | None |
| Scripted commits via the player's token | Daily Victories | Clockwork detection; trial gate stops at Warden I | Varied-time scripts evade detection (bounded as E1) |
| Self-merged PR spam | MVPs and trials | Self-merges are 15 EXP, max 2/day, and are **not** objectives | None for rank |
| Release spam | Objectives | ≥ 3 qualifying commits since the last release; 1 per repo per 7 days; ≤ 2 count per week; not contested | Minor contribution to lower trials |
| Sockpuppet reviewer | Contested objectives | Human-account rule (≥ 30 days old); Eternal needs ≥ 3 distinct counterparts | Determined multi-account fraud (out of scope; it only fools the player's own profile) |
| Backdated commits | Retroactive quests and streaks | Effective dates; 48 h period closure | None |
| Rerunning the generator | Different quest boards, double awards | Deterministic seeds; ledger idempotency | None |
| Editing config to add activity | Fake progress | Config schema has no such fields (INT-1) | None |
| Fork farming | Free languages and EXP | Forks excluded | None |

## 6. Tuning levers (per ruleset version)

| Lever | Raises | Lowers | Watch metric after Season 1 |
| --- | --- | --- | --- |
| Victory threshold (30) | Difficulty for light players | Star inflation | Share of active days that are Victories (target 60–80% for B) |
| Weekly star cap (5) | Ceiling rank | Grinding | Weeks capped (target ≤ 50% for B) |
| Trial objective counts | Exclusivity of top tiers | Accessibility | Tier distribution of the player across seasons |
| Commit diminishing curve | Value of busy days | Farming | Days at commit cap (target < 10% for real players) |
| Activity BP rate (20%) | BP from work | Quest dominance | Ratio of quest BP to activity BP (target 2:1 to 3:1) |
| Shop prices | Time to buy | Sink depletion | Months until catalog exhausted (target > 12) |

All lever changes are **prospective** (PRD §8). They are recorded in the ruleset changelog and noted in the README "How it works" page.
