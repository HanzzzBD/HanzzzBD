# GitHub Legends — Quest Catalog

- **Version:** 0.1 · **Date:** 2026-10-20 · Ruleset `v1`
- Rules are in `game-design-document.md` §F. All quests reward **BP only** (STK-5). Every condition counts **qualifying** events (GDD §1.2) with **effective dates** inside the period (PRD §4.4), in Asia/Jakarta time.
- **Completion key:** `quest:<id>:<periodId>`; evidence keys are stored with it.
- **Priority:** P0 = MVP; P1 = needs P1 data or systems (emblems, equipment, squad).

**Column guide.** *Slot*: daily board slot (1 core, 2 variety, 3 any). *Eligibility*: the condition to enter the pool. *Verification*: the evidence checked.

## 1. Daily quests (repeatable, expire at day closure)

| ID | Name | Objective | BP | Slot | Eligibility | Verification | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D01 | First Blood | 1 qualifying commit | 10 | 1, 3 | Always | Commit keys | P0 |
| D02 | Victory Lap | Win today's battle (score ≥ 30) | 15 | 1, 3 | Always | Battle entry for the day | P0 |
| D03 | Triple Strike | ≥ 3 qualifying commits | 15 | 3 | ≥ 3-commit day in last 30 days | Commit keys | P0 |
| D04 | Two Fronts | Qualifying commits in 2 different repos | 15 | 2, 3 | ≥ 2 eligible repos active in last 30 days | Commit keys, distinct repos | P0 |
| D05 | Second Opinion | 1 peer review | 20 | 2 | Peer review in last 90 days | Review IDs, human author | P0 |
| D06 | Objective Secured | 1 merged PR (any qualifying) | 20 | 2 | Merged PR in last 90 days | PR node IDs | P0 |
| D07 | Triage | Open or resolve 1 issue | 10 | 2, 3 | Issue activity in last 90 days | Issue node IDs | P0 |
| D08 | Hero Training | Commit to a repo where the main hero's technology share is ≥ 10% | 15 | 3 | Main hero set and unlocked | Commit keys + language snapshot | P0 |
| D09 | Green Lane | 1 successful push-triggered workflow run in an owned repo (not schedule, not bot) | 15 | 2, 3 | Owns the GitHub Actions item | Run IDs, event = push, actor = player | P1 |
| D10 | Contested Ground | 1 contested objective | 25 | 2 | Contested objective in last 90 days | Objective evidence | P0 |
| D11 | Quality Pass | A merged PR whose head commit has all checks successful | 20 | 2 | Owns a Tome item and the Actions item | PR + check-suite conclusion | P1 |

**Board composition:** slot 1 from {D01, D02}; slot 2 from the eligible variety quests (D04–D07, D09–D11; falls back to D03 when none is eligible); slot 3 from any eligible quest not yet on the board.

## 2. Weekly quests (repeatable, expire at week closure; unlock at level 3)

| ID | Name | Objective | BP | Eligibility | Verification | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| W01 | Steady Hands | 4 Victories (or MVPs) | 100 | Always | Battle entries | P0 |
| W02 | Marathon | Active on 5 days | 100 | ≥ 3 active days in a week within the last 4 weeks | Battle entries (any result) | P0 |
| W03 | Siege | 3 merged PRs | 120 | ≥ 3 merged PRs in last 90 days | PR node IDs | P0 |
| W04 | Bug Hunter | Resolve 2 issues | 80 | Issue resolved in last 90 days | Issue node IDs, state_reason completed | P0 |
| W05 | Dual Wield | Commits in repos of 2 different unlocked heroes (share ≥ 10%) | 80 | ≥ 2 heroes unlocked | Commit keys + snapshots | P0 |
| W06 | Ship Day | 1 qualifying release | 150 | Release in last 180 days | Release ID + qualifying rule | P0 |
| W07 | Peer Review | 3 peer reviews | 120 | Peer review in last 90 days | Review IDs | P0 |
| W08 | MVP Performance | 1 MVP battle | 120 | Contested objective in last 90 days | Battle entry | P0 |
| W09 | Explorer | A qualifying commit in a repo with no player commits in the previous 30 days | 80 | ≥ 2 eligible repos | Commit keys + repo history | P0 |
| W10 | Tidy Week | No Skirmish days: every active day a Victory (min. 3 active days) | 100 | Always | Battle entries | P0 |

**Dedication bonus:** all 3 dailies completed on ≥ 5 days of the week gives +50 BP (`quest:dedication:<week>`), P0.

## 3. Season contracts (once per season, expire at season closure)

Two contracts are offered per season, deterministically drawn.

| ID | Name | Objective | BP | Extra | Priority |
| --- | --- | --- | --- | --- | --- |
| S01 | Season Regular | Complete 40 daily quests | 300 | Badge style | P0 |
| S02 | Weekly Warrior | Complete 15 weekly quests | 350 | Badge style | P0 |
| S03 | Campaigner | Reach Warden this season | 200 | — | P0 |
| S04 | Bridge Builder | 6 contested objectives | 400 | Frame tint | P0 |
| S05 | Well-Rounded | Battles with commits in 3 different heroes' repos on 10 days | 250 | — | P0 |
| S06 | Ten Victories Clean | 10 Victory weeks at the 5-star cap | 400 | Title "Relentless" | P0 |

## 4. Collaborative quests (repeatable; need another human)

| ID | Period | Name | Objective | BP | Eligibility | Verification | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | Daily | Ally Assist | Review a PR authored by a verified ally | 25 | ≥ 1 verified ally | Review ID + ally match | P1 |
| C02 | Daily | Co-Op Commit | 1 qualifying commit co-authored with a human (`Co-authored-by` matched to a GitHub user) | 20 | Co-authored commit in last 90 days | Commit trailer + user match | P1 |
| C03 | Weekly | Squad Up | Interactions with 2 different verified allies | 100 | ≥ 2 verified allies | Synergy events | P1 |
| C04 | Weekly | Reviewed and Merged | 1 PR merged after an approving review from another human | 150 | Contested objective in last 90 days | PR + review | P0 |
| C05 | Weekly | Good Neighbour | 1 external merge (PR merged into a repo the player does not own) | 150 | External PR in last 180 days | PR + repo ownership | P0 |
| C06 | Weekly | Community Fix | Resolve an issue opened by another human | 120 | Community fix in last 90 days | Issue author + closer | P0 |

C04 to C06 are P0 because they need only P0 data. They enter the weekly pool when eligible.

## 5. Emblem specialty quests (weekly, +1 slot; P1)

| Emblem | ID | Objective | BP |
| --- | --- | --- | --- |
| Frontend | E-FE | 3 qualifying commits in repos with FE weight ≥ 0.5 on 3 different days | 100 |
| Backend | E-BE | 3 qualifying commits in repos with BE weight ≥ 0.5 on 3 different days | 100 |
| Full-stack | E-FS | Qualifying commits in an FE-dominant and a BE-dominant repo in the same week | 100 |
| AI/ML | E-AI | 3 qualifying commits in repos with AI weight ≥ 0.5 | 100 |
| DevOps | E-OP | 3 days with a successful push-triggered workflow run | 100 |
| Database | E-DB | 2 qualifying commits in repos with DB weight ≥ 0.2 or migration markers | 100 |
| Open Source | E-OS | 1 external merge **or** 2 peer reviews in repos the player does not own | 150 |

## 6. Milestone campaigns (one-time, never expire)

Campaign steps run in order. One campaign is "featured" on the README (the first incomplete one). Rewards are paid on campaign completion (milestone BP, STK-7). Steps never duplicate a medal condition (STK-11).

| Campaign | Steps | Reward | Map checkpoint | Priority |
| --- | --- | --- | --- | --- |
| **K1 The First Campaign** | ① Win 3 battles after install · ② Complete 5 daily quests · ③ Complete 1 weekly quest · ④ Reach Squire | 200 BP, title "Campaigner" | Starter Village banner | P0 |
| **K2 Path of the Hero** | ① Set a main hero · ② Earn 300 MP on the main hero · ③ Unlock a hero of a different role · ④ Main hero reaches Adept | 250 BP, frame "Heroic" | Forest of Branches banner | P0 |
| **K3 Second Opinions** | ① Give 3 peer reviews · ② Receive an approving review from another human · ③ Win 2 MVP battles in one ISO week | 300 BP, title "Trusted Reviewer" | River of Reviews banner | P0 |
| **K4 Release Train** | ① A qualifying release with non-empty release notes · ② Qualifying releases in 2 different months · ③ A release with ≥ 10 qualifying commits since the previous one | 300 BP, badge style "Shipper" | Citadel of Releases banner | P0 |
| **K5 Rising Through the Ranks** | ① Complete the Champion trial · ② Reach Champion II · ③ End a season at Champion or above | 400 BP, title "Ascending" | Citadel of Releases | P0 |
| **K6 Open Waters** | ① Open an issue in another person's repo · ② An external merge containing ≥ 2 qualifying commits · ③ 3 external merges in ≥ 2 repos | 400 BP, title "Open Source Ally" | Open Commons banner | P0 (data) / P1 (map) |
| **K7 Attunement** | ① Attune an emblem · ② Its level reaches 3 · ③ Complete 4 specialty quests | 300 BP | Domain region banner | P1 |
| **K8 Gear Up** | ① Equip 3 verified items · ② An item reaches Rare · ③ Complete Green Lane 5 times | 250 BP, frame "Outfitter" | Harbor of Pipelines | P1 |
| **K9 Squad Formation** | ① First verified ally · ② 2 verified allies · ③ Squad strength ≥ 30 | 300 BP | River of Reviews | P1 |
| **K10 Long Road** | ① Season badges in 4 consecutive seasons · ② Level 50 · ③ Any hero Virtuoso | 500 BP, title "Long Roader" | Throne of Eternity | P0 |

## 7. Expiration and verification summary

| Type | Active window | Closes / expires | Late or backdated events |
| --- | --- | --- | --- |
| Daily | Player day | 48 h after the day ends | Ignored after closure; effective-date rule |
| Weekly | Mon 00:00 – Sun 23:59:59 | 48 h after the week ends | Same |
| Season contract | Season | Season closure | Same |
| Collaborative | Day or week | Same as daily or weekly | Same; human-account rule checked at the event time |
| Milestone campaign | Unlimited | Never | Historical verified events count (backfill-friendly) |

**Determinism:** boards are generated from `hash(playerId, periodId, rulesetVersion, slot)`. A run inside the period always shows the same board. A ruleset change mid-period applies from the next period.
