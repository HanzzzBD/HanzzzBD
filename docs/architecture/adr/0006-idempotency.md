# ADR-0006: Prevent duplicate rewards with idempotency keys and append-only cap allocation

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Events can be observed several times (overlapping windows, reruns, several endpoints). Late-arriving events can land on days that already have awards. The ledger is immutable.

## Decision

- Every event has a stable key; every ledger entry has an idempotency key `<rule>|<subjects>` that must be unique.
- Caps and diminishing curves are allocated **append-only**: a late event receives the next ordinal after those already awarded for that day; past entries are never rewritten.
- Mutable facts (merged, closed, visibility) are new event revisions; awards reference `key@rev`.
- Commit fingerprints catch rebase and cherry-pick duplicates (GDD §1.5).

## Consequences

- Positive: reruns are no-ops; the ledger is auditable.
- Negative: the final allocation can depend on arrival order across runs (a late commit gets a lower diminishing value). Accepted: deterministic given the committed history, and bounded by the same caps.
