# GitHub Legends — Feature Catalog

- **Version:** 0.1 · **Date:** 2026-10-20
- Source of truth for feature IDs and priorities. The behaviour of each feature is specified in `prd.md` (section in the "PRD" column). Acceptance criteria are in `acceptance-criteria.md`.

**Priority:** `P0` = MVP · `P1` = first post-MVP release · `P2` = later · `Deferred` = needs a capability outside the current architecture (D-01).
**Data layers:** L1 Verified · L2 Ledger · L3 Derived · L4 Self-declared (PRD §3).

## Foundation

| ID | Feature | System | PRD | Priority | Data | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| F-001 | Collector: contribution calendar and totals (yearly windows) | Core | §4, §10 | P0 | L1 | — |
| F-002 | Collector: default-branch commits per eligible repo, with additions/deletions and parents | Core | §4.1 | P0 | L1 | — |
| F-003 | Collector: PRs authored and merged, reviews given and received | Core | §4.1 | P0 | L1 | — |
| F-004 | Collector: issues opened and resolved | Core | §4.1 | P0 | L1 | — |
| F-005 | Collector: releases per owned repo | Core | §4.1 | P0 | L1 | — |
| F-006 | Collector: repository languages and flags (fork, archived, owner), snapshotted per run | Core | §6.5 | P0 | L1 | — |
| F-007 | Collector: private contribution count delta | Core | §4.1 | P0 | L1 | F-001 |
| F-008 | Collector: workflow runs for owned repos | Core | §6.8, §6.9 | P1 | L1 | — |
| F-009 | Qualification filters (bot, fork, empty, merge commit, non-default branch, unlinked author) | Core | §4.1 | P0 | L1 | F-002–F-005 |
| F-010 | Effective-date attribution with `firstSeenAt` and 48 h period closure | Core | §4.4 | P0 | L2 | F-009 |
| F-011 | Append-only ledger with idempotency keys and rule versions | Core | §7.1 | P0 | L2 | — |
| F-012 | Stacking rules STK-1 to STK-10 enforced by the rules engine | Core | §4.2 | P0 | L2 | F-011 |
| F-013 | Daily and weekly caps, with zero-award `capped` entries | Core | §4.3 | P0 | L2 | F-011 |
| F-014 | Player config file with schema validation (fail-safe on error) | Core | §3, §6.* | P0 | L4 | — |
| F-015 | Ruleset versioning (prospective changes) | Core | §8 | P0 | — | F-011 |
| F-016 | Ledger rebuild with diff report and confirmation flag | Core | §8 | P2 | L2 | F-015 |
| F-017 | Initial backfill (lifetime + Season 1 window, milestone BP only) | Core | §10 | P0 | L1/L2 | F-001–F-013 |

## Progression and economy

| ID | Feature | System | PRD | Priority | Data | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| F-101 | EXP awards per qualifying activity | SYS-02 | §4.3, §6.2 | P0 | L2 | F-012, F-013 |
| F-102 | Level curve 1–100 with overflow | SYS-02 | §6.2 | P0 | L3 | F-101 |
| F-103 | Level-up milestone BP and title unlocks | SYS-02 | §6.2 | P0 | L2 | F-102, F-110 |
| F-104 | Daily battles: score, Skirmish / Victory / MVP | SYS-13 | §6.13 | P0 | L2/L3 | F-010, F-101 |
| F-105 | Stars, tiers and divisions (original names), no demotion | SYS-03 | §6.3 | P0 | L3 | F-104 |
| F-106 | Tier first-reached BP | SYS-03 | §6.3 | P0 | L2 | F-105 |
| F-107 | Season calendar (quarterly), closure, soft reset | SYS-11 | §6.11 | P0 | L3 | F-105 |
| F-108 | Season-end BP and season badge | SYS-11 | §6.11 | P0 | L2 | F-107 |
| F-110 | BP balance from ledger; activity BP (20% of EXP); weekly earn cap 700 | SYS-04 | §6.4 | P0 | L2 | F-101 |
| F-111 | Shop catalog (cosmetics, emblem sets, extra slot) with level and rank gates | SYS-04 | §6.4 | P1 | data | F-110 |
| F-112 | Config purchases: requestId idempotency, ordered settlement, rejection reasons | SYS-04 | §6.4 | P1 | L4→L2 | F-111, F-014 |
| F-113 | Inventory (titles, frames, skins, themes, emblems, slots) | SYS-04 | §6.4 | P1 | L2/L3 | F-112 |
| F-114 | Quest reroll tokens | SYS-04 | §13 | Deferred | L4→L2 | F-112 |

## Heroes, emblems and equipment

| ID | Feature | System | PRD | Priority | Data | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| F-201 | Hero catalog v1 (about 15 original language heroes across 6 roles) | SYS-05 | §6.5 | P0 | data | — |
| F-202 | Weighted technology usage and hero unlock thresholds | SYS-05 | §6.5 | P0 | L3 | F-006, F-101 |
| F-203 | Undiscovered / discovered / unlocked states; "Unknown Spirit" fallback | SYS-05 | §6.5 | P0 | L3 | F-202 |
| F-204 | Main hero selection and hide list (config) | SYS-05 | §6.5 | P0 | L4 | F-203 |
| F-205 | Mastery points with per-award language snapshot | SYS-06 | §6.6 | P0 | L2/L3 | F-202 |
| F-206 | Mastery tiers and tier BP | SYS-06 | §6.6 | P0 | L2 | F-205 |
| F-207 | Hero skins (mastery unlocks and shop) | SYS-06 | §6.6 | P1 | L2 | F-113 |
| F-208 | Framework heroes (React, Laravel, Prisma…) | SYS-05 | §13 | Deferred | L1 | F-303 |
| F-251 | Emblem levels from activity counts | SYS-07 | §6.7 | P1 | L3 | F-101 |
| F-252 | Active emblem (config), 7-day cooldown, BP bonus (BP only) | SYS-07 | §6.7 | P1 | L4/L2 | F-251, F-110 |
| F-253 | Specialty quest slot from active emblem | SYS-07 | §6.7 | P1 | L3 | F-252, F-401 |
| F-254 | Emblem set unlocks in the shop | SYS-07 | §6.7 | P1 | L2 | F-112 |
| F-255 | Emblem talents | SYS-07 | §13 | Deferred | — | F-252 |
| F-301 | Item catalog (development tools) | SYS-08 | §6.8 | P1 | data | — |
| F-302 | Item ownership from GitHub Actions runs and repo topics | SYS-08 | §6.8 | P1 | L1/L3 | F-008 |
| F-303 | Item ownership from marker-file and manifest scanning | SYS-08 | §13 | P2 | L1/L3 | F-301 |
| F-304 | Build (5 slots, +1 purchasable), declared kit row (✎) | SYS-08 | §6.8 | P1 | L4 | F-302, F-113 |

## Engagement

| ID | Feature | System | PRD | Priority | Data | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| F-401 | Deterministic daily board (3 quests) | SYS-09 | §6.9 | P0 | L3 | F-010 |
| F-402 | Deterministic weekly board (3 quests), unlocked at level 3 | SYS-09 | §6.9 | P0 | L3 | F-401 |
| F-403 | Quest eligibility filters and fallbacks | SYS-09 | §6.9 | P0 | L3 | F-401 |
| F-404 | Quest completion, BP award, expiry after closure | SYS-09 | §6.9 | P0 | L2 | F-401 |
| F-405 | Dedication weekly bonus | SYS-09 | §6.9 | P0 | L2 | F-404 |
| F-501 | Medal engine (rules, tiers, evidence, earned-on date, hidden medals) | SYS-10 | §6.10 | P0 | L2 | F-101 |
| F-502 | Starter medal set (about 20) | SYS-10 | §6.10 | P0 | data | F-501 |
| F-503 | Medal rewards (BP, titles, frames) | SYS-10 | §6.10 | P0 | L2 | F-501 |
| F-601 | Battle history log in the ledger, with highlights (private highlights never shown) | SYS-13 | §6.13 | P0 | L2/L3 | F-104 |
| F-602 | Personal records | SYS-14 | §6.14 | P1 | L3 | F-104 |
| F-603 | Season ladder and hero ladder | SYS-14 | §6.14 | P1 | L3 | F-107, F-205 |
| F-604 | Opt-in public ladder | SYS-14 | §13 | Deferred | — | Service |
| F-701 | Allies and synergy (90-day window), hide list | SYS-12 | §6.12 | P1 | L1/L3 | F-003 |
| F-702 | Collaboration BP and Collaborator medals | SYS-12 | §6.12 | P1 | L2 | F-701 |
| F-703 | Real multi-user squads | SYS-12 | §13 | Deferred | — | Service |
| F-801 | World map SVG (regions, checkpoints, player marker) | SYS-15 | §6.15 | P1 | L3 | F-102, F-501 |
| F-802 | Map themes (shop cosmetics) | SYS-15 | §6.15 | P2 | L2 | F-113 |
| F-803 | Interactive map | SYS-15 | §13 | Deferred | — | Web app |

## Presentation

| ID | Feature | System | PRD | Priority | Data | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| F-901 | Marker-based README injection, fail-safe | SYS-16 | §6.16 | P0 | — | — |
| F-902 | Player Card SVG (light and dark), embedded avatar, text summary | SYS-01 | §6.1 | P0 | L1/L3/L4 | F-102, F-105 |
| F-903 | Season strip | SYS-11 | §6.16 | P0 | L3 | F-107 |
| F-904 | Hero lineup (top 3) | SYS-05 | §6.16 | P0 | L3 | F-205 |
| F-905 | Quest board (stamped "as of") | SYS-09 | §6.16 | P0 | L3 | F-404 |
| F-906 | Medals strip | SYS-10 | §6.16 | P0 | L3 | F-501 |
| F-907 | Battle history `<details>` section | SYS-13 | §6.16 | P0 | L3 | F-601 |
| F-908 | Footer: provenance legend, last updated, stale-data warning | SYS-16 | §6.16 | P0 | — | — |
| F-909 | Generated docs: hero collection, medal book, ledger summary, "How it works" | SYS-16 | §7.4 | P0 | L3 | F-011 |
| F-910 | Section toggles in config | SYS-16 | §6.16 | P0 | L4 | F-014 |
| F-911 | Records, map, squad and equipment `<details>` sections | SYS-16 | §6.16 | P1 | L3 | F-602, F-801, F-701, F-304 |
| F-912 | Title and frame selection on the card | SYS-01 | §6.1 | P1 | L4 | F-113 |
| F-913 | Animated SVG variants (reduced-motion aware) | SYS-16 | §13 | P2 | — | — |

## Deferred, outside the current architecture

| ID | Feature | Needs |
| --- | --- | --- |
| F-X01 | Private repository detail via PAT | Owner opt-in and privacy design (D-02) |
| F-X02 | Issue-command shop | Abuse review; P1 shop proven |
| F-X03 | Web dashboard | Hosting (D-01 revisit) |
| F-X04 | Packaged reusable GitHub Action for adopters | Config schema freeze |
| F-X05 | Prestige beyond level 100 | — |
| F-X06 | Time-of-day medals | Reliable local-time data |
