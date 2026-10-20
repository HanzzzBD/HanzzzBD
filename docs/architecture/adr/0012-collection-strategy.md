# ADR-0012: Hybrid GraphQL/REST collection with watermarks and resumable backfill

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

No single endpoint covers all activity (feasibility §2). Rate limits are modest with `GITHUB_TOKEN`. Backfill can be large.

## Decision

- GraphQL for user-level contributions, commit history (with additions and deletions) and PR/review/issue details; REST for repo lists, languages, releases, workflow runs and trees.
- Per-source watermarks with a 7-day overlap, deduplicated by key.
- Sequential requests with throttling and retry plugins; a per-run request budget; `partial` results keep the last complete watermark.
- Backfill uses a persisted cursor and continues across runs.

## Consequences

- Positive: works within limits; robust to failures; no duplicate processing.
- Negative: more collector code; several endpoints must be kept in sync with API changes (contract tests mitigate).
