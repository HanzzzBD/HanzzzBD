# GitHub Legends — Data Model

- **Version:** 0.1 · **Date:** 2026-10-20
- Types are written in TypeScript notation and describe the schema contract. They are validated with zod at load time. Field names are final candidates and may be refined during implementation without changing semantics.
- Layers follow PRD §3: **L1** verified events, **L2** ledger, **L3** derived snapshot, **L4** configuration.

## 1. Common types

```ts
type Instant   = string;  // UTC ISO-8601, e.g. "2026-10-19T10:15:00Z"
type PlayerDay = string;  // "2026-10-19" in Asia/Jakarta
type IsoWeek   = string;  // "2026-W43"
type SeasonId  = string;  // "S1"
type RulesetVersion = string; // "1.0.0"
type RepoId = number;     // GitHub numeric id (stable across renames)
type UserId = number;
```

## 2. L1 — Verified events (`legends/state/events/YYYY-MM.ndjson`)

> **Implemented** in `legends/src/normalize/event.ts` (Phase 05). That file is the source of truth for the event types; this section summarises them.

One JSON object per line, partitioned by the `occurredAt` month. A revision of an existing key is a new line with a higher `rev`; readers keep the highest `rev` per key (`latestByKey`).

```ts
interface NormalizedEvent<T extends EventType> {
  key: string;                 // stable identifier (table below)
  type: T;                     // commit | pull_request | review | issue | release | workflow_run
                               // | contribution_day | private_contribution_count | repo_snapshot
  rev: number;                 // 1, 2, …: assigned by mergeObservations
  repo: RepoRef | null;        // null for user-level events
  actor: ActorRef | null;      // who performed the event, when known
  occurredAt: string;          // GitHub-reported time (author date, mergedAt, submittedAt, closedAt, publishedAt)
  firstSeenAt: string;         // first observation (or occurredAt during backfill); never changes
  metadata: MetadataByType[T]; // only the facts the game needs
  provenance: { sources: SourceId[]; api: "rest" | "graphql"; collectorVersion: string };
  verification: { status: "verified" | "partial" | "unverifiable"; notes: string[] };
}
interface RepoRef  { id: string /* "gh:<databaseId>" | "p:<hmac>" */; visibility: "public" | "private";
                     fullName?: string /* public, or private only if explicitly allowed */;
                     ownedByPlayer: boolean; isFork: boolean; isArchived: boolean }
interface ActorRef { id: number | null; kind: "user" | "bot" | "organization" | "unknown"; isPlayer: boolean;
                     login?: string /* human non-player on public repos only */; accountCreatedAt?: string }
```

**Verification status:** `verified` means every fact the game uses was present in the response. `partial` means some optional fact was missing or truncated, and `notes` says which (for example `co_authors_truncated`, `changed_files_unavailable`, `approvals_truncated`, `closer_not_observed`, `calendar_timezone_unconfirmed`). Downstream rules must treat partial facts conservatively.

| Type | Key | Metadata (stored) |
| --- | --- | --- |
| `commit` | `commit:<repoRef.id>:<sha or pseudonym>` | `sha`, `parentCount`, `additions`, `deletions`, `changedFiles\|null`, `authoredAt`, `committedAt`, `onDefaultBranch`, `playerIsPrimaryAuthor`, `coAuthorIds`, `fingerprint`, `messagePatternHit` |
| `pull_request` | `pr:<nodeId or pseudonym>` | `number?` (public only), `state`, `merged`, `mergedAt`, `createdAt`, `authorIsPlayer`, `mergedByIsPlayer`, `approvers[{id, accountCreatedAt}]` (human, non-player), `commitCount` |
| `review` | `review:<prId>:<playerId>` (one per PR, STK-3) | `pullRequestKey`, `prAuthor`, `state`, `hasBody`, `submittedAt` (earliest review) |
| `issue` | `issue:<nodeId or pseudonym>` | `number?`, `state`, `stateReason`, `createdAt`, `closedAt`, `author`, `closedByPlayer\|null` |
| `release` | `release:<repoRef.id>:<id or pseudonym>` | `tag?` (sanitised, public only), `isDraft`, `isPrerelease`, `publishedAt`, `hasNotes`, `authorIsPlayer` |
| `workflow_run` | `run:<repoRef.id>:<id or pseudonym>` | `event`, `status`, `conclusion`, `createdAt`, `actorIsPlayer`, `triggeredByPlayer`, `actorKind` |
| `contribution_day` | `cal:<YYYY-MM-DD>` | `date`, `count` (GitHub calendar; streaks only, STK-9) |
| `private_contribution_count` | `private_count:<windowFrom>:<windowTo>` | `windowFrom`, `windowTo`, `restrictedContributionsCount` (the engine derives deltas) |
| `repo_snapshot` | `repo_snapshot:<repoRef.id>:<YYYY-MM-DD>` | `observedOn`, `languages` (bytes per Linguist language), `pushedAt` |

**Never stored:** commit messages (used in memory for `fingerprint` and `messagePatternHit` only), PR, issue and release titles, bodies and notes text, branch names, emails, avatar URLs, file paths, and private repository names, numbers, tags or real identifiers (unless a name is explicitly allowed).

**Changes from v0.1 of this document:** keys include the `RepoRef.id` prefix (`gh:` or `p:`); per-type flags such as `authorIsBot` moved into `ActorRef.kind`; `provenance` and `verification` were added; release `qualifyingCommitsSincePrev` is computed by the engine, not the collector.

## 3. L2 — Ledger (`legends/state/ledger/YYYY-MM.ndjson`)

Append-only. Partitioned by the **run** month (`createdAt`).

```ts
interface LedgerEntry {
  id: string;               // = idempotencyKey (unique)
  kind: 'exp' | 'bp' | 'star' | 'unlock' | 'medal' | 'quest' | 'season' | 'purchase' | 'flag' | 'trial';
  rule: string;             // e.g. "exp.commit", "bp.activity", "star.victory", "quest.complete"
  ruleVersion: RulesetVersion;
  subject: string[];        // event key(s) with revs ("commit:123:abc@1"), or period ids ("2026-10-19", "2026-W43", "S1"), or a requestId
  amount: number;           // EXP, BP (negative for purchases), stars; 0 allowed (capped, rejected)
  reason?: 'capped' | 'weekly_cap' | 'duplicate' | 'automation' | 'insufficient_bp' | 'requirement_not_met' | 'unavailable' | 'overflow';
  eventDate?: Instant;
  effectiveDay?: PlayerDay;
  week?: IsoWeek;
  season?: SeasonId;
  meta?: Record<string, string | number | boolean>;   // e.g. { ordinal: 6 } for commit EXP; { heroId: "syntaria" }
  createdAt: Instant;       // runAt of the creating run
  stateVersion: number;
}
```

**Idempotency key grammar:** `<rule>|<subject…>` (subjects sorted), e.g.

| Award | Key |
| --- | --- |
| Commit EXP | `exp.commit\|commit:123:abc` |
| Victory star | `star.victory\|2026-10-19` |
| MVP upgrade star | `star.mvp\|2026-10-19` |
| Daily quest | `quest.complete\|D05\|2026-10-19` |
| Medal tier | `medal\|M-010\|II` |
| Hero unlock | `unlock.hero\|syntaria` |
| Season close | `season.close\|S1` |
| Purchase | `purchase\|<requestId>` |

**Invariants (checked on every run; violation = `RuleViolation`):**

1. Ids are unique.
2. The BP balance (Σ bp) ≥ 0 after every entry, in ledger order.
3. Daily commit EXP ≤ 75; per-rule daily caps hold.
4. Stars per ISO week ≤ 5 (excluding `overflow` entries, which carry amount 0).
5. Every non-zero EXP entry references a qualifying event at its latest rev.
6. No entry references an event key that does not exist.

## 4. L3 — Snapshot (`legends/state/snapshot.json`)

Recomputable. Used by the renderers and for fast reads.

```ts
interface Snapshot {
  schema: 1; rulesetVersion: RulesetVersion; computedAt: Instant; stateVersion: number;
  player: { userId: UserId; login: string; createdAt: Instant; avatarDataUri?: string; displayName?: string; title?: string; frame?: string; motto?: string };
  progression: { exp: number; level: number; expIntoLevel: number; expForNext: number; title: string };
  season: { id: SeasonId; name: string; startsAt: Instant; endsAt: Instant; daysLeft: number; stars: number; bankedStars: number;
            tier: TierId; division?: 1 | 2 | 3; starsInDivision: number; starsForDivision: number;
            trial?: { targetTier: TierId; objectives: number; required: number; contested: number; contestedRequired: number; repos?: number; counterparts?: number };
            weekStars: number; weekCap: number; peakTier: TierId };
  economy: { bp: number; weekEarned: number; weekCap: number; lastTransaction?: { requestId: string; itemId: string; status: string } };
  streak: { current: number; longest: number };
  heroes: Array<{ id: string; state: 'discovered' | 'unlocked'; mp: number; tier: MasteryTier; isMain: boolean; hidden: boolean; repos: number; lastActive?: PlayerDay; mpApproximate: boolean }>;
  emblems?: Array<{ id: EmblemId; ep: number; level: number; attuned: boolean; active: boolean }>;          // P1
  equipment?: { items: Array<{ id: string; state: 'verified' | 'tagged'; tier: ItemTier; repos: number; lastSeen?: PlayerDay }>; build: string[]; declared: string[] }; // P1
  quests: { daily: QuestView[]; weekly: QuestView[]; contracts: QuestView[]; campaign?: CampaignView; asOf: Instant };
  medals: { earned: Array<{ id: string; tier?: string; rarity: Rarity; earnedOn: PlayerDay }>; total: number; available: number };
  battles: Array<{ day: PlayerDay; result: 'skirmish' | 'victory' | 'mvp'; score: number; final: boolean; highlights: Highlight[] }>; // last 30
  map?: MapView;           // P1
  squad?: SquadView;       // P1
  records?: RecordView[];  // P1
  health: { status: 'fresh' | 'partial' | 'stale' | 'failed-run'; lastSuccessfulRun: Instant; sources: Record<SourceId, SourceStatus> };
  backfill: { status: 'pending' | 'running' | 'done'; progress: number };
}
```

`Highlight` holds only public-safe fields: `{ kind, repoFullName? (public only), number?, label (generated from a template) }`.

## 5. Files and formats (`legends/state/`)

| Path | Format | Ordering | Size estimate |
| --- | --- | --- | --- |
| `events/YYYY-MM.ndjson` | NDJSON, canonical JSON per line | By `(eventDate, key, rev)` within each append batch | ≈ 150–300 KB/year for an active user |
| `ledger/YYYY-MM.ndjson` | NDJSON, canonical JSON | Engine evaluation order | ≈ 200–400 KB/year |
| `snapshot.json` | Pretty canonical JSON | — | < 100 KB |
| `seasons/S<n>.json` | Pretty canonical JSON | — | < 20 KB each |
| `meta.json` | Pretty canonical JSON | — | < 10 KB |

**`meta.json`:**

```ts
interface Meta {
  schemaVersion: number; rulesetVersion: RulesetVersion; stateVersion: number;
  player: { userId: UserId; login: string };
  watermarks: Record<SourceId, { position: string; at: Instant }>;
  backfill: { status: 'pending' | 'running' | 'done'; cursor?: unknown; progress: number };
  checksums: Record<string /* relative path */, string /* sha256 */>;
  lastRun: { at: Instant; status: 'ok' | 'partial' | 'failed'; sources: Record<SourceId, SourceStatus> };
  lastSuccessfulRun?: Instant;
  closed: { days: PlayerDay /* highest closed */; weeks: IsoWeek; seasons: SeasonId[] };
}
```

**Canonical JSON:** UTF-8, keys sorted, no insignificant whitespace in NDJSON, numbers as integers where possible (EXP, BP and stars are integers; MP and EP are integers; percentages are not stored).

**Migrations:** `schemaVersion` bump → an ordered list of pure migration functions `vN → vN+1` over the whole state. A migration runs only in a manual dispatch with `--migrate`. Scheduled runs refuse a mismatched schema (`StateIntegrityError`).

## 6. L4 — Player configuration (`legends/player.config.yml`)

```yaml
version: 1
player:
  login: HanzzzBD               # used to resolve the numeric user id on first run
  timezone: Asia/Jakarta        # PD-05
  displayName: "Hadrian"        # ✎, ≤ 32 chars
  motto: "Learn hard now, relax later."   # ✎, ≤ 80 chars
  title: rookie                 # must be in inventory
  frame: plain                  # must be in inventory
heroes:
  main: syntaria                # must be unlocked
  hide: []                      # hero ids
emblem: { active: null }        # P1; cooldown enforced from the ledger
build: []                       # P1; item ids (verified only)
declaredTools: [unity, blender] # ✎ only; never rewarded
excludeRepos: []                # reduces credit only
automationRepos: []             # reduces credit only
squad: { enabled: true, hide: [], members: [] }   # P1
sections: { map: true, battles: true, build: true, squad: true, records: true }
medals: { hide: [] }
purchases: []                   # P1: [{ requestId: "p-2026-0001", itemId: "frame.ember" }]
```

**Schema rules:** unknown keys are errors; string fields have length limits and are stored raw but escaped at render time; ids are validated against ruleset catalogs (`^[a-z0-9.-]{1,48}$`). **No field can set EXP, BP, level, rank, stars, mastery, medals, unlocks or equipment ownership** (AC-CORE-14).

## 7. Ruleset (`legends/rules/v1/`)

| File | Content |
| --- | --- |
| `meta.yml` | `version`, `timezone default`, `effectiveFrom` |
| `exp.yml` | Activity values, curves, caps (GDD R-01, R-02, economy §2) |
| `ranks.yml` | Tiers, divisions, stars, trials, weekly cap, soft reset, rewards |
| `levels.yml` | Formula parameters, titles, gates |
| `bp.yml` | Activity rate, weekly cap, battle BP, milestone BP |
| `quests.yml` | Quest catalog, boards, eligibility predicates (declarative DSL, §8) |
| `medals.yml` | Medal catalog with declarative conditions |
| `heroes.yml` | Roster, Linguist name aliases, roles, unlock thresholds, mastery tiers |
| `emblems.yml` | Domain weights, EP rules, levels (P1) |
| `items.yml` | Item catalog, slot categories, markers, topics (P1) |
| `map.yml` | Regions, slots, gates, checkpoints (P1) |
| `shop.yml` | Items, prices, gates (P1) |
| `seasons.yml` | Season calendar and names |
| `automation.yml` | Detection thresholds, message patterns (as safe literal substrings, not regex, to avoid ReDoS) |
| `tokens.yml` | Design tokens (dark and light) |

## 8. Declarative rule conditions

Quest, medal and campaign conditions use a small, closed, schema-validated vocabulary instead of code in YAML:

```yaml
- id: W03
  name: Siege
  period: week
  reward: { bp: 120 }
  eligibility: { count: { of: pr.merged, window: P90D, atLeast: 3 } }
  objective:   { count: { of: pr.merged, inPeriod: true, atLeast: 3 } }
```

Supported operators: `count`, `distinct`, `sum`, `all`, `any`, `streak`, `reach` (tier, level, mastery), `ref` (another medal or quest). Unknown operators fail schema validation. The evaluator is a pure interpreter over qualifying events and the snapshot.
