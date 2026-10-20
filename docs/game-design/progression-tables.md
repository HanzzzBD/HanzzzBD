# GitHub Legends — Progression Tables

- **Version:** 0.1 · **Date:** 2026-10-20 · Ruleset `v1` (default values; tunable through ruleset versions, PRD §8)
- These are the reference tables for the engine and tests. The rationale is in `economy-balancing.md`, the mechanics in `game-design-document.md`.

## 1. Player levels

- EXP from level n to n+1 = `100 + 50(n−1)`
- Cumulative EXP for level n = `100(n−1) + 25(n−1)(n−2)`
- Level-up BP: 25 per level, plus 100 on each multiple of 10 (so 125 on those levels). Levels 31–34, 36–39 and so on, not shown, follow the formulas.

| Level | EXP to next | Cumulative EXP | BP on reaching | Title unlock | Gate unlock |
| --- | --- | --- | --- | --- | --- |
| 1 | 100 | 0 | — | Rookie | Daily quests, shop Basic, Starter Village |
| 2 | 150 | 100 | 25 |  |  |
| 3 | 200 | 250 | 25 |  | Weekly quests |
| 4 | 250 | 450 | 25 |  |  |
| 5 | 300 | 700 | 25 |  | Shop: Rare · Forest of Branches |
| 6 | 350 | 1,000 | 25 |  |  |
| 7 | 400 | 1,350 | 25 |  |  |
| 8 | 450 | 1,750 | 25 |  |  |
| 9 | 500 | 2,200 | 25 |  |  |
| 10 | 550 | 2,700 | 125 | Journeyman | River of Reviews · domain regions |
| 11 | 600 | 3,250 | 25 |  |  |
| 12 | 650 | 3,850 | 25 |  |  |
| 13 | 700 | 4,500 | 25 |  |  |
| 14 | 750 | 5,200 | 25 |  |  |
| 15 | 800 | 5,950 | 25 |  | Shop: Epic |
| 16 | 850 | 6,750 | 25 |  |  |
| 17 | 900 | 7,600 | 25 |  |  |
| 18 | 950 | 8,500 | 25 |  |  |
| 19 | 1,000 | 9,450 | 25 |  |  |
| 20 | 1,050 | 10,450 | 125 | Adventurer | Citadel of Releases |
| 21 | 1,100 | 11,500 | 25 |  |  |
| 22 | 1,150 | 12,600 | 25 |  |  |
| 23 | 1,200 | 13,750 | 25 |  |  |
| 24 | 1,250 | 14,950 | 25 |  |  |
| 25 | 1,300 | 16,200 | 25 |  |  |
| 26 | 1,350 | 17,500 | 25 |  |  |
| 27 | 1,400 | 18,850 | 25 |  |  |
| 28 | 1,450 | 20,250 | 25 |  |  |
| 29 | 1,500 | 21,700 | 25 |  |  |
| 30 | 1,550 | 23,200 | 125 | Veteran | Shop: Legendary |
| 35 | 1,800 | 31,450 | 25 |  | Peaks of Mastery |
| 40 | 2,050 | 40,950 | 125 | Vanguard |  |
| 45 | 2,300 | 51,700 | 25 |  |  |
| 50 | 2,550 | 63,700 | 125 | Hero | Throne of Eternity |
| 55 | 2,800 | 76,950 | 25 |  |  |
| 60 | 3,050 | 91,450 | 125 | Paladin |  |
| 65 | 3,300 | 107,200 | 25 |  |  |
| 70 | 3,550 | 124,200 | 125 |  |  |
| 75 | 3,800 | 142,450 | 25 | Mythsmith |  |
| 80 | 4,050 | 161,950 | 125 |  |  |
| 85 | 4,300 | 182,700 | 25 |  |  |
| 90 | 4,550 | 204,700 | 125 |  |  |
| 95 | 4,800 | 227,950 | 25 |  |  |
| 100 | — (overflow) | 252,450 | 125 | Living Legend |  |

**Pace reference** (from `economy-balancing.md` §4): a new developer reaches level 12 after 1 year; an active student reaches about level 28; a multi-repo maintainer about level 36.

## 2. Rank ladder (seasonal)

| Tier | Division | Stars in division | Cumulative stars to enter | Trial to enter tier | First-time BP (per season) |
| --- | --- | --- | --- | --- | --- |
| Initiate | III / II / I | 3 / 3 / 3 | 0 / 3 / 6 | — | — |
| Squire | III / II / I | 3 / 3 / 3 | 9 / 12 / 15 | — | 30 |
| Knight | III / II / I | 4 / 4 / 4 | 18 / 22 / 26 | — | 50 |
| Warden | III / II / I | 4 / 4 / 4 | 30 / 34 / 38 | — | 80 |
| Champion | III / II / I | 5 / 5 / 5 | 42 / 47 / 52 | 3 objectives (≥ 1 contested) | 120 |
| Paragon | III / II / I | 5 / 5 / 5 | 57 / 62 / 67 | 8 objectives (≥ 3 contested) | 180 |
| Ascendant | — | 20 | 72 | 15 objectives (≥ 6 contested, ≥ 2 repos) | 250 |
| Eternal | ★ count | ∞ | 92 | 25 objectives (≥ 10 contested, ≥ 3 distinct human counterparts) | 400 |

### 2.1 Battle results

| Result | Day score (capped EXP) | Extra condition | Stars | BP |
| --- | --- | --- | --- | --- |
| No battle | 0 | — | — | — |
| Skirmish | 1–29 | — | 0 | 0 |
| Victory | ≥ 30 | — | +1 | 15 |
| MVP | ≥ 100 | ≥ 1 contested objective that day | +2 | 30 |

**Weekly star cap:** 5 per ISO week (excess becomes `overflow`). **Max stars per season** ≈ 65 (13 weeks × 5).

### 2.2 Soft reset (−3 tiers)

| Final tier | Next season start | Starting stars |
| --- | --- | --- |
| Eternal | Champion III | 42 |
| Ascendant | Warden III | 30 |
| Paragon | Knight III | 18 |
| Champion | Squire III | 9 |
| Warden, Knight, Squire, Initiate | Initiate III | 0 |

### 2.3 Season-end rewards (by peak tier)

| Peak tier | BP | Cosmetic |
| --- | --- | --- |
| Initiate | 100 | Season badge |
| Squire | 150 | Season badge |
| Knight | 250 | Season badge |
| Warden | 350 | Season badge |
| Champion | 500 | Badge + season frame (bronze-tone) |
| Paragon | 650 | Badge + season frame (silver-tone) |
| Ascendant | 800 | Badge + season frame (gold-tone) |
| Eternal | 1,000 | Badge + season frame (prismatic) + title "Eternal of S<n>" |

## 3. Season calendar (Asia/Jakarta)

| Season | Start | End | Closure (immutable after) |
| --- | --- | --- | --- |
| S1 | 2026-10-01 00:00 | 2026-12-31 23:59:59 | 2027-01-03 00:00 |
| S2 | 2027-01-01 | 2027-03-31 | 2027-04-03 |
| S3 | 2027-04-01 | 2027-06-30 | 2027-07-03 |
| S4 | 2027-07-01 | 2027-09-30 | 2027-10-03 |

## 4. Hero mastery

| Tier | MP | BP | Unlock |
| --- | --- | --- | --- |
| Novice | 100 (hero unlock) | 50 (unlock) | Hero card |
| Adept | 1,000 | 30 | Frame tone |
| Veteran | 3,000 | 60 | Frame tone |
| Expert | 8,000 | 120 | Skin variant "Gilded" |
| Virtuoso | 20,000 | 250 | Prismatic frame |
| Exalted | 50,000 | 500 | Animated frame, title "<Hero>'s Chosen" |

**Hero unlock threshold:** weighted usage ≥ 100, share ≥ 10% in an eligible repo with ≥ 5 qualifying player commits.

## 5. Emblem levels

| Level | EP (cumulative) | BP on reaching |
| --- | --- | --- |
| 1 | 100 | 20 |
| 2 | 400 | 40 |
| 3 | 1,000 | 60 |
| 4 | 2,000 | 80 |
| 5 | 3,500 | 100 |
| 6 | 5,500 | 120 |
| 7 | 8,000 | 140 |
| 8 | 11,000 | 160 |
| 9 | 15,000 | 180 |
| 10 | 20,000 | 200 |

Attunement: first free; each further attunement 500 BP (level ≥ 2). Active emblem bonus: +15% matching activity BP (Full-stack +8% on all commit BP). Switch cooldown: 7 days.

## 6. Equipment tiers

| Tier | Eligible repos with Verified evidence | Extra | BP (first time) |
| --- | --- | --- | --- |
| Common | 1 | — | — |
| Rare | 3 | — | 20 |
| Epic | 6 | — | 50 |
| Legendary | 10 | Seen in last 90 days | 100 |

## 7. Equipment marker catalog (v1)

| Item | Slot | Verified markers (any) | Tagged topics |
| --- | --- | --- | --- |
| GitHub Actions | Boots | `.github/workflows/*.yml` and ≥ 1 successful push-triggered run | `github-actions` |
| Docker | Armor | `Dockerfile`, `*.Dockerfile` | `docker` |
| Compose | Armor | `compose.yaml`, `compose.yml`, `docker-compose.yml` | `docker-compose` |
| Nginx | Armor | `nginx.conf`, `nginx/*.conf` | `nginx` |
| Terraform | Armor | `*.tf` | `terraform` |
| Kubernetes | Armor | `Chart.yaml`, `kustomization.yaml` | `kubernetes` |
| pnpm | Forge | `pnpm-lock.yaml` | `pnpm` |
| npm | Forge | `package-lock.json` | `npm` |
| Yarn | Forge | `yarn.lock` | `yarn` |
| Bun | Forge | `bun.lockb`, `bun.lock` | `bun` |
| Composer | Forge | `composer.lock` | `composer` |
| Poetry / pip | Forge | `poetry.lock`, `requirements.txt`, `pyproject.toml` | `python` |
| Vite | Forge | `vite.config.(js|ts|mjs)` | `vite` |
| Prisma | Relic | `prisma/schema.prisma`, `schema.prisma` | `prisma` |
| Database migrations | Relic | `database/migrations/`, `migrations/`, `alembic.ini` | `database` |
| Redis | Relic | `redis.conf` (P2: dependency `ioredis`/`redis`/`predis`) | `redis` |
| Vitest | Tome | `vitest.config.*` | `vitest` |
| Jest | Tome | `jest.config.*` | `jest` |
| PHPUnit | Tome | `phpunit.xml`, `phpunit.xml.dist` | `phpunit` |
| pytest | Tome | `pytest.ini`, `conftest.py` | `pytest` |
| ESLint | Tome | `eslint.config.*`, `.eslintrc*` | `eslint` |
| Prettier | Tome | `.prettierrc*`, `prettier.config.*` | `prettier` |
| Laravel | Charm | `artisan` and `composer.json` | `laravel` |
| Expo | Charm | `eas.json`, `app.json` + `expo` folder conventions (P2: dependency `expo`) | `expo` |
| Next.js | Charm | `next.config.*` | `nextjs` |
| Tailwind CSS | Charm | `tailwind.config.*` | `tailwindcss` |
| Unity | Charm | `ProjectSettings/ProjectVersion.txt` | `unity` |
| Godot | Charm | `project.godot` | `godot` |

Markers are matched on the default-branch tree of eligible repos. Vendored paths (`node_modules/`, `vendor/`, `third_party/`) are ignored.

## 8. World map gates

| Region | Type | Gate | Checkpoints | Unlock BP |
| --- | --- | --- | --- | --- |
| Starter Village | Main | Level 1 | First Commit · First Victory · First Hero | 50 |
| Forest of Branches | Main | Level 5 | First merged PR · 3 heroes discovered · First weekly quest | 50 |
| River of Reviews | Main | Level 10 | First peer review · Knight · First verified ally | 50 |
| Citadel of Releases | Main | Level 20 | First qualifying release · Hero Expert · Champion trial | 50 |
| Peaks of Mastery | Main | Level 35 | 6 heroes · Emblem L5 · Paragon | 50 |
| Throne of Eternity | Main | Level 50 | Eternal · Hero Virtuoso · 4 season badges | 50 |
| Lantern Spires | Domain | Frontend L1 and level 10 | Frontend L1 / L4 / L7 | 50 |
| Iron Forge | Domain | Backend L1 and level 10 | Backend L1 / L4 / L7 | 50 |
| Twin Bridges | Domain | Full-stack L1 and level 10 | Full-stack L1 / L4 / L7 | 50 |
| Observatory of Patterns | Domain | AI/ML L1 and level 10 | AI/ML L1 / L4 / L7 | 50 |
| Harbor of Pipelines | Domain | DevOps L1 and level 10 | DevOps L1 / L4 / L7 | 50 |
| Vault of Records | Domain | Database L1 and level 10 | Database L1 / L4 / L7 | 50 |
| Open Commons | Domain | Open Source L1 and level 10 | Open Source L1 / L4 / L7 | 50 |

## 9. Shop price bands (v1)

| Shop tier (level gate) | Item type | Price (BP) |
| --- | --- | --- |
| Basic (L1) | Titles (common), badge styles | 200–400 |
| Rare (L5) | Card frames, hero palette skins | 600–1,200 |
| Epic (L15) | Patterned hero skins, map themes | 1,500–3,000 |
| Legendary (L30) | Animated frames (reduced-motion aware), legendary titles | 4,000–6,000 |
| Utility | Emblem attunement | 500 each |
| Utility | 6th build slot | 1,500 (once) |
| Season Vault | Season-exclusive frame (peak tier gate) | 2,500 |
