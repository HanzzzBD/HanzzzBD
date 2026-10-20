# GitHub Legends — Data Flow

- **Version:** 0.1 · **Date:** 2026-10-20
- How data moves through one run, how state evolves across runs, and how failures and backfill are handled.

## 1. One run, end to end

```
 ┌──────────── job: build (contents: read) ────────────────────────────────────────────┐
 │                                                                                      │
 │ 0 Load      player.config.yml ─► config (validated)      rules/v1 ─► ruleset          │
 │             legends/state/**  ─► StateStore (checksums verified, schema migrated)    │
 │             runAt := now() (UTC instant, captured ONCE)                               │
 │                                                                                      │
 │ 1 Collect   GitHub API ─► RawRecord[] per source + SourceStatus + new watermarks      │  I/O
 │                                                                                      │
 │ 2 Normalize RawRecord[] + known events ─► L1 Event[] (keys, revs, firstSeenAt,        │  pure
 │             qualification facts, fingerprints, automation signals, redactions)       │
 │                                                                                      │
 │ 3 Engine    (ruleset, config, events, ledger, runAt, sourceHealth)                    │  pure
 │             ─► new LedgerEntry[] + diagnostics                                       │
 │                                                                                      │
 │ 4 Derive    ledger + events + config + ruleset + runAt ─► Snapshot (L3)               │  pure
 │                                                                                      │
 │ 5 Render    Snapshot + tokens(dark, light) ─► FileSet (SVG, MD pages, README block)   │  pure
 │                                                                                      │
 │ 6 Validate  FileSet + README ─► issues (must be empty)                                │  pure
 │                                                                                      │
 │ 7 Stage     write out/: changed files + manifest.json (paths, sha256, stateVersion)   │  fs
 │             + job summary                                                            │
 └──────────────────────────────────────────┬───────────────────────────────────────────┘
                                            │ artifact (no tokens inside)
 ┌──────────── job: publish (contents: write) ───────────────────────────────────────────┐
 │ 8 Verify    manifest paths ⊂ allow-list; README bytes outside markers unchanged;       │
 │             checksums match; base stateVersion == current main's stateVersion         │
 │ 9 Commit    one commit: state + assets + docs/legends + README → push to main          │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

**Determinism contract:** steps 2–6 are pure functions of their inputs plus `runAt`. Re-executing them with the same inputs gives byte-identical outputs (`testing-strategy.md` §3).

## 2. State across runs

| Artifact | Changes per run | Mutability |
| --- | --- | --- |
| `events/*.ndjson` | New events appended; existing keys may get a new revision line (`rev+1`) | Append-only (revisions are new lines) |
| `ledger/*.ndjson` | New entries appended | **Append-only, immutable** |
| `snapshot.json` | Rewritten | Derived; can always be recomputed |
| `seasons/S<n>.json` | Written once at closure | Immutable |
| `meta.json` | Watermarks, cursor, checksums, `stateVersion+1`, last run | Rewritten |
| Generated outputs | Rewritten if changed | Derived |

`stateVersion` increases by 1 on every published run and acts as an optimistic lock (system-architecture §8).

## 3. Event lifecycle

```
GitHub object ─collect─► RawRecord ─normalize─► Event(key, rev=1, firstSeenAt=runAt)
                                                  │
                     later run sees a change ─────┤─► Event(key, rev=2, …)   e.g. PR merged, issue closed, repo went private
                                                  │
                     engine reads latest rev ─────┴─► LedgerEntry(subject=key@rev, rule, amount)
```

- **Revisions** never change `firstSeenAt` or `eventDate`.
- **Visibility change** (public repo becomes private or inaccessible): normalisation writes a **redaction revision** that drops the repo name and per-item details, keeping only the numeric ids and amounts (ADR-0009). Renderers then show "private contribution".
- **Deletion** (404 on a repo): same as above, plus the `source_unavailable` flag (INT-4).

## 4. Time handling

- `runAt` is captured once per run and passed everywhere. No module calls `Date.now()` (enforced by a lint rule).
- All instants are stored as UTC ISO-8601 strings. Player-day, ISO-week and season ids are computed in `Asia/Jakarta` by `core/time` (fixed UTC+7, no DST; the implementation still uses the IANA zone for future-proofing).
- **Effective date** = `max(eventDate, firstSeenAt − 48 h)` converted to the player day (PRD §4.4).
- **Closure** = first run at or after `periodEnd + 48 h` with all dependent sources `complete`.
- **Weeks that straddle seasons** (for example 2026-W53 = 2026-12-28 → 2027-01-03, across S1 → S2): weekly caps (stars, BP) and weekly quests stay keyed by ISO week. Each star is attributed to the season of its battle's player day. Season closure of S1 does not wait for W53 to close: it uses only S1's days.

## 5. Backfill flow (first install and resumable)

```
meta.backfill = { status: 'pending', cursor: { repoIndex, commitCursor, yearWindow } }

run (mode=backfill, or automatic while status != 'done'):
  for each source in order:
     collect from cursor until budget threshold
     persist records + advance cursor            ← committed with the run's state
  if all sources exhausted → status = 'done'
  engine runs on everything collected so far, with firstSeenAt := eventDate  (backfill rule, PRD §10)
  README shows "⏳ Backfill in progress (63%)" while status != 'done'
```

- Backfill events get `firstSeenAt = eventDate` and the flag `backfill: true`.
- Activity BP for dates before Season 1 is not awarded; milestone BP is (PD-10).
- Periods inside Season 1 that ended more than 48 h before install are **closed immediately** after backfill completes (their data is historical and complete by definition).
- Daily scheduled runs continue incremental collection alongside a pending backfill; each run spends its remaining budget on the backfill cursor.

## 6. Failure paths

| Failure point | State written? | Outputs written? | README effect |
| --- | --- | --- | --- |
| Config invalid | Yes (normal run, previous selections) | Yes | Warning in summary only |
| One collector failed | Yes (other sources' events and awards, watermark of the failed source unchanged) | Yes | Health "partial"; stale banner after 3 days |
| All collectors failed | Only `meta.lastRun` | Footer health only | Stale banner after 3 days |
| State integrity error | No | No | Unchanged (owner must fix; see runbook) |
| Engine invariant violated | No | No | Unchanged |
| Output validation failed | No (atomic with outputs) | No | Unchanged |
| Publish conflict | No | No | Next run redoes it |

## 7. Data flow to public outputs (privacy filter)

```
Snapshot ──► render
   │
   ├─ public-safe fields only (ADR-0009): repo names only for public, non-redacted repos;
   │   no commit messages, PR titles, issue titles or branch names anywhere in state or output
   ├─ private aggregate rendered as a number with the label "Private contributions (aggregate)"
   └─ allies: logins only, after the squad.hide filter
```

## 8. Manual and maintenance flows

| Command | Purpose | Writes |
| --- | --- | --- |
| `legends run` | Normal scheduled run | Staged outputs |
| `legends backfill` | Spend the full budget on the backfill cursor | Staged outputs |
| `legends verify` | Recompute the snapshot from the ledger, compare with `snapshot.json`; validate checksums and invariants | Nothing (report) |
| `legends rebuild --dry-run` | Re-run the engine over all events with the current ruleset against an empty ledger; print the diff to the current ledger (PRD §8) | Nothing |
| `legends rebuild --confirm` | Replace the ledger (keeps purchases and processed requestIds); archives untouched unless `--include-archives` | Staged outputs (requires a manual dispatch) |
| `legends render --fixtures` | Render outputs from test fixtures (CI golden check) | `out/` only |
