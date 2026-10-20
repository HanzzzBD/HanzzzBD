# GitHub Legends — Mastery and Emblem System

- **Phase:** 07 (implementation) · **Date:** 2026-10-20
- **Code:** `legends/src/engine/heroes/attribution.ts`, `mastery.ts`, `emblems.ts`
- **Spec:** GDD §C.3–C.6 (mastery), §D (emblems, PD-19); progression-tables §4–5
- **Companion:** `hero-system.md`

> Mastery points (MP) and emblem points (EP) measure **verified activity volume**, routed through repository language statistics. Those statistics show which technologies a repository uses, not what the player knows. The engine never turns them into a proficiency claim.

## 1. Inputs (verifiable data only)

| Input | Source | Why it is trustworthy |
| --- | --- | --- |
| Commit EXP awards | Ledger `exp.commit` entries | Already passed qualification: no bots, empty or merge commits, duplicates, automation or forks; capped by the daily curve |
| Language snapshots | `repo_snapshot` events (Linguist bytes per language, per day observed) | Read from the GitHub API |
| PR and review EXP | Ledger `exp.pr`, `exp.review` | Qualified and capped |
| Workflow runs | `workflow_run` events | Read from the GitHub API |
| Issues | `issue` events | Read from the GitHub API |
| Marker paths | `repo_markers` events | Path matches only (game-project rule) |

Private repositories, forks and excluded repositories contribute nothing.

## 2. Attribution (`attribution.ts`)

For each commit EXP award:

1. Find the repo (from the event; for a deleted event, from the `commit:gh:<id>:…` key).
2. Choose the repo's **latest language snapshot observed on or before the award day** (the award's `createdAt` day). This is the "snapshot stored with each award" of GDD §C.3: past awards keep the shares that were true when they were made, so rewriting a repo in another language never rewrites history.
3. If the award predates the repo's first snapshot, use the earliest snapshot and mark the result `approximate` (GDD §C.6, backfill).
4. If the repo has no snapshot at all, the award contributes nothing and `no_language_snapshot` is reported (missing metadata).

**Integer arithmetic:** each award contributes `floor(exp × bytes × 1000 / totalBytes)` milli-points per language; MP = `floor(Σ milli / 1000)`. Results never depend on float order, and Σ MP ≤ Σ commit EXP (AC-SYS06-01).

## 3. Hero mastery

| Tier | MP | BP on reaching | Cosmetic |
| --- | --- | --- | --- |
| Novice | 100 (= unlock) | 50 (hero unlock) | Hero card |
| Adept | 1,000 | 30 | Bronze-tone frame |
| Veteran | 3,000 | 60 | Silver-tone frame |
| Expert | 8,000 | 120 | Gilded skin variant |
| Virtuoso | 20,000 | 250 | Prismatic frame |
| Exalted | 50,000 | 500 | Animated frame, title "<Hero>'s Chosen" |

- **Unlock conditions:** see `hero-system.md` §2. Tiers above Novice are recorded only for unlocked heroes.
- **Historical progression:** each tier is a ledger entry (`mastery|<hero>|<tier>`) with its own BP entry (`bp.mastery|<hero>|<tier>`). `tierHistory` lists every tier with the day it was first recorded. Tiers never go down. A jump over several tiers in one run records each tier, in order.
- **Progress toward the next tier:** `indicator { percent, current, next, label }` in the hero card.
- **Pace:** with commit EXP capped at 75 per day, MP can grow by at most 75 per day across all heroes.

### 3.1 Ambiguous technology attribution

| Ambiguity | Handling |
| --- | --- |
| Multi-language repositories | Every award is split by byte share; no language receives full credit for a mixed repo |
| Mixed-purpose languages (Python, C#, TypeScript) | Heroes stay bound to the language. Domain meaning is handled by emblems, using repository context |
| Several Linguist names for one technology | Catalog aliases (SQL family → Ledgera; ShaderLab and HLSL → Prismara) |
| Languages without a hero | Unknown Spirit (tracked, never rewarded) |
| Vendored or generated code | Linguist exclusions; the 10% share rule for unlocks; `excludeRepos` (reduces credit only) |
| Repo rewritten in another language | Past awards keep their original snapshot; new awards use the new one |
| Award older than the first snapshot | Earliest snapshot, marked `approximate` |
| No language data | Nothing credited; reported |
| Notebooks inflating Jupyter bytes | Accepted as designed (a 0.5 weight is a possible future tuning, not adopted) |

## 4. Emblems (specialisation)

### 4.1 Emblem Points

| Emblem | EP source |
| --- | --- |
| Frontend · Backend · AI/ML · DevOps · Database | Σ commit EXP × the repo's domain weight (language weights below, from the award's snapshot) |
| Full-stack | 2 × min(Frontend EP, Backend EP) |
| DevOps (extra) | +5 EP per player day with ≥ 1 successful push run triggered by the player in an owned repo |
| Open Source | EXP from merges and reviews in repos the player does not own + 15 EP per issue the player opened elsewhere that was closed as completed |

**Language → domain weights (%):** HTML, CSS, SCSS, Vue, Svelte FE 100 · TypeScript, JavaScript FE 60 / BE 40 · Blade FE 50 / BE 50 · PHP, Java, Go, Kotlin, Ruby, Elixir, C# BE 100 · Python BE 50 / AI 50 · Jupyter Notebook, R AI 100 · Shell, Dockerfile, HCL, Nix, PowerShell, Makefile Ops 100 · SQL, PLpgSQL, PLSQL, TSQL DB 100 · Rust, C, C++ BE 50. Languages not listed feed no domain. In **game projects** (Unity or Godot marker), C#, ShaderLab, HLSL and GDScript feed no domain.

### 4.2 Levels, ownership and attunement

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EP | 100 | 400 | 1,000 | 2,000 | 3,500 | 5,500 | 8,000 | 11,000 | 15,000 | 20,000 |
| BP | 20 | 40 | 60 | 80 | 100 | 120 | 140 | 160 | 180 | 200 |

- Each level is recorded once (`emblem.level|<id>|<n>` + `bp.emblem_level|<id>|<n>`), and levels never go down. **Owned** = level ≥ 1.
- **Attunement:** the first attunement is free and happens automatically when the player first activates an owned emblem (`emblem.attune|<id>`). Further attunements cost 500 BP through the shop, which is not implemented yet, so they are refused with `emblem_not_attuned`.
- **Active emblem** (`config.emblem.active`): must be owned and attuned; it can change at most once per 7 days (`emblem_cooldown`). `null` deactivates, also subject to the cooldown. Each change is recorded as `emblem.activate|<day>`, so the active emblem on any past day can be reconstructed.

### 4.3 Active bonus (BP only, STK-8)

Activity BP = floor(20% × EXP), then × (100 + bonus)% with floor rounding, still within the 700 BP weekly cap.

| Active emblem | Bonus applies to |
| --- | --- |
| Frontend, Backend, AI/ML, DevOps, Database | +15% on commit BP in repos where that domain's weight is ≥ 0.5 (award's snapshot) |
| Full-stack | +8% on all commit BP |
| Open Source | +15% on merge and review BP in repos the player does not own |

The bonus uses the emblem that was active on the award's effective day. At small values it can round away (floor(2 × 1.15) = 2); this is the documented rounding rule.

## 5. Differences from the approved design and open items

| # | Topic | Status |
| --- | --- | --- |
| M-1 | **AC-SYS07-01** said a Backend emblem boosts a merged PR's BP. GDD §D.4 applies single-domain bonuses to commits only. The engine follows the GDD, and the acceptance criterion text was corrected (its 60 → 13 BP example now uses Open Source) | Corrected |
| M-2 | Game-project detection needs marker data (Unity `ProjectSettings/ProjectVersion.txt`, Godot `project.godot`). Until the collector fetches trees, C# in Unity repos still counts as Backend. **This affects the owner's Unity work** | Collector work pending |
| M-3 | Repo topic modifiers (P1) are not implemented: topics re-route weights only, and topics are not collected for this yet | Pending |
| M-4 | Database "+3 EP per commit touching migration/schema paths" (P2) is not implemented: it needs per-commit file paths | Pending (P2) |
| M-5 | Emblem specialty quests and the map highlight need the quest and map systems | Pending |
| M-6 | Paid attunement (500 BP) needs the shop; only the first, free attunement works | Pending (shop) |
| M-7 | Mastery uses snapshots from `repo_snapshot` events rather than a copy stored on every ledger entry. The result is the same as long as the store keeps snapshots (it is append-only) | Implementation choice |
| M-8 | The unlock rule's "≥ 10% share" uses each repo's current (latest) snapshot | Interpretation |

## 6. Tests

See `hero-system.md` §7. Mastery and emblem tests cover every tier boundary (−1 and exact), tier BP and history, integer splits, historical snapshot attribution, approximate flags, missing and unknown metadata, every emblem level boundary, domain weights, Full-stack balance, the game-project rule, DevOps run filtering, Open Source sources, activation, attunement, cooldown, bonus maths (including AC-SYS07-01) and deterministic, idempotent engine runs.
