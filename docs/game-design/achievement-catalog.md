# GitHub Legends — Medal Catalog (Achievements)

- **Version:** 0.1 · **Date:** 2026-10-20 · Ruleset `v1`
- In-product name: **Medals** (PRD PD-15). The README's hand-written "🏆 Achievements" section is real-world awards and is never touched.
- Rules are in `game-design-document.md` §G. Every medal is a pure rule over verified (L1), ledger (L2) and derived (L3) data, with stored evidence keys and an **earned-on** date equal to the date of the qualifying event.

## 1. Rarity and rewards

| Rarity | Design target | BP | Extra |
| --- | --- | --- | --- |
| Common | First weeks of activity | 25 | — |
| Uncommon | Within the first season | 50 | — |
| Rare | Within the first year of active play | 100 | Title or badge style |
| Epic | Multi-year or sustained collaboration | 200 | Frame |
| Legendary | Exceptional, long-term | 400 | Animated frame (reduced-motion aware) |

Rarity is a design target for a single player, not a population statistic. The medal book says so.

**Priority:** P0 = computable from MVP data; P1 = needs P1 systems.

## 2. Catalog

### 2.1 First steps

| ID | Medal | Rarity | Prerequisite | Verification condition | Priority |
| --- | --- | --- | --- | --- | --- |
| M-001 | First Commit | Common | — | ≥ 1 qualifying commit | P0 |
| M-002 | First Victory | Common | — | ≥ 1 Victory or MVP battle | P0 |
| M-003 | First Merge | Common | — | ≥ 1 qualifying merged PR | P0 |
| M-004 | First Review | Uncommon | — | ≥ 1 peer review | P0 |
| M-005 | First Release | Uncommon | — | ≥ 1 qualifying release | P0 |
| M-006 | Problem Solver | Common | — | ≥ 1 issue resolved | P0 |
| M-007 | First MVP | Uncommon | M-002 | ≥ 1 MVP battle | P0 |

### 2.2 Volume families (tiered; each tier requires the previous one)

| ID | Medal | Tiers (rarity) | Verification condition | Priority |
| --- | --- | --- | --- | --- |
| M-010 | Committed | I 100 (Common) · II 1,000 (Rare) · III 5,000 (Epic) | Count of qualifying commits **that earned > 0 EXP** (capped and flagged commits excluded) | P0 |
| M-011 | Integrator | I 10 (Uncommon) · II 50 (Rare) · III 200 (Epic) | Qualifying merged PRs; self-merged PRs count at most 1 per day | P0 |
| M-012 | Reviewer | I 10 (Uncommon) · II 50 (Rare) · III 250 (Epic) | Peer reviews (one per PR) | P0 |
| M-013 | Shipper | I 5 (Rare) · II 25 (Epic) | Qualifying releases | P0 |
| M-014 | Fixer | I 10 (Uncommon) · II 50 (Rare) · III 200 (Epic) | Issues resolved | P0 |

### 2.3 Consistency

| ID | Medal | Rarity | Prerequisite | Verification condition | Priority |
| --- | --- | --- | --- | --- | --- |
| M-020 | Streak I / II / III / IV | Common / Rare / Epic / Legendary | Previous tier | Contribution-calendar streak of 7 / 30 / 100 / 365 days (GitHub's own count, including private if enabled) | P0 |
| M-021 | Weekly Warrior | Uncommon | — | 4 consecutive ISO weeks at the 5-star cap | P0 |
| M-022 | Marathon Season | Rare | — | ≥ 60 battles (any result) in one season | P0 |
| M-023 | Clean Sheet | Rare | — | A season with ≥ 30 battles and no Skirmish | P0 |

### 2.4 Rank and seasons

| ID | Medal | Rarity | Prerequisite | Verification condition | Priority |
| --- | --- | --- | --- | --- | --- |
| M-030 | Knighted | Uncommon | — | Reach Knight in any season | P0 |
| M-031 | Champion | Rare | M-030 | Reach Champion (trial completed) | P0 |
| M-032 | Ascendant | Epic | M-031 | Reach Ascendant | P0 |
| M-033 | Eternal | Legendary | M-032 | Reach Eternal | P0 |
| M-034 | Season Finisher | Uncommon | — | A season closed at Knight or above | P0 |
| M-035 | Veteran of Seasons | Rare | M-034 | 4 season badges | P0 |
| M-036 | Season-specific medal "S<n> Contender" | Uncommon | — | Complete both season contracts in season n (one medal per season, collectible) | P0 |

### 2.5 Heroes and mastery

| ID | Medal | Rarity | Prerequisite | Verification condition | Priority |
| --- | --- | --- | --- | --- | --- |
| M-040 | Recruiter I / II / III | Common / Rare / Epic | Previous tier | 3 / 6 / 10 heroes unlocked | P0 |
| M-041 | Every Role | Epic | M-040 I | ≥ 1 unlocked hero in each of the 6 roles | P0 |
| M-042 | Expert's Touch | Rare | — | Any hero at Expert | P0 |
| M-043 | Virtuoso | Epic | M-042 | Any hero at Virtuoso | P0 |
| M-044 | Exalted | Legendary | M-043 | Any hero at Exalted | P0 |
| M-045 | Polyglot Week | Uncommon | — | Qualifying commits in repos of 3 different heroes in one ISO week | P0 |

### 2.6 Emblems (P1)

| ID | Medal | Rarity | Verification condition |
| --- | --- | --- | --- |
| M-050 | Attuned | Common | Attune an emblem |
| M-051 | Specialist | Uncommon | Any emblem level 5 |
| M-052 | Master Specialist | Epic | Any emblem level 10 |
| M-053 | Both Ends | Rare | Full-stack emblem level 5 |
| M-054 | Many Paths | Epic | Four emblems at level ≥ 3 |

### 2.7 Collaboration

| ID | Medal | Rarity | Verification condition | Priority |
| --- | --- | --- | --- | --- |
| M-060 | Collaborator | Uncommon | First external merge | P0 |
| M-061 | Open Source Regular | Epic | 10 external merges across ≥ 3 repos the player does not own | P0 |
| M-062 | Peer Reviewer | Rare | Peer reviews for ≥ 5 distinct human authors | P0 |
| M-063 | Co-Op | Uncommon | A qualifying commit co-authored with a human GitHub user | P1 |
| M-064 | Squad of Four | Rare | 4 verified allies at the same time | P1 |
| M-065 | Community Pillar | Epic | 25 community fixes (issues opened by others, resolved by the player) | P0 |

### 2.8 Quests and campaigns

| ID | Medal | Rarity | Verification condition | Priority |
| --- | --- | --- | --- | --- |
| M-070 | Questline I / II / III | Common / Uncommon / Rare | 25 / 100 / 500 daily quests completed | P0 |
| M-071 | Dedicated | Rare | Dedication bonus in 4 different weeks | P0 |
| M-072 | Campaign Complete | Legendary | All 10 milestone campaigns completed | P1 |

### 2.9 Equipment (P1)

| ID | Medal | Rarity | Verification condition |
| --- | --- | --- | --- |
| M-080 | Full Build | Rare | 5 verified items at Rare+ equipped |
| M-081 | Container Kit | Uncommon | Docker, Compose and Nginx verified |
| M-082 | Quality Gate | Uncommon | 2 Tome items and GitHub Actions verified |
| M-083 | Green Pipeline | Uncommon | 30 successful push-triggered workflow runs in owned repos |

### 2.10 World map (P1)

| ID | Medal | Rarity | Verification condition |
| --- | --- | --- | --- |
| M-090 | Explorer | Uncommon | 3 regions unlocked |
| M-091 | Pathfinder | Epic | All 6 main-path regions unlocked |
| M-092 | Cartographer | Legendary | All 7 domain regions unlocked |

### 2.11 Hidden medals (shown as "???" with a hint until earned)

| ID | Medal | Rarity | Hint | Verification condition | Priority |
| --- | --- | --- | --- | --- | --- |
| M-100 | Phoenix | Uncommon | "Every legend returns." | A Victory after ≥ 30 days with no battle | P0 |
| M-101 | Comeback Season | Rare | "Higher than before." | A season peak above the previous season's peak, after a season below Knight | P0 |
| M-102 | Weekend Warrior | Uncommon | "Saturdays are for shipping." | 10 Victories on Saturdays or Sundays (local effective date) | P0 |
| M-103 | Clutch | Rare | "Just in time." | Complete a promotion trial in the last 7 days of a season | P0 |
| M-104 | Polymath | Epic | "Six schools, one mind." | A hero at Adept in each of the 6 roles | P0 |

## 3. Integrity rules

- A medal is awarded once per tier (`medal:<id>:<tier>`), including during backfill.
- Count-based medals use **qualifying** events only. M-010 counts only commits that earned EXP, so spam beyond the daily curve or flagged automation never counts.
- Config can hide medals from the README; it cannot grant or reorder evidence.
- A medal whose source later becomes unavailable stays earned (INT-4), and its evidence is anonymised in output.
- Adding a medal in a new ruleset evaluates it over full history, using historical earned-on dates.
