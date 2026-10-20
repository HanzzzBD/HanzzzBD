# ADR-0001: Use GitHub Actions with state persisted in the repository

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The product needs monotonic progress, idempotent awards, effective dates (`firstSeenAt`), seasons, quests and a battle history beyond the API retention windows (D-04, PRD §4.4, §7.1). The product is single-user (D-01) and must not need hosting.

## Decision

Three options were compared (system-architecture §2):
1. **Actions only, stateless:** recompute everything from the API every run.
2. **Actions + persisted state in the repo:** a ledger, events and snapshots committed by the workflow.
3. **External database or service:** for example a serverless function plus a hosted DB.

**Decision: option 2.**

## Consequences

- Positive: no hosting, no secrets, full audit trail in git, reproducible from committed state.
- Negative: the repo accumulates state history (≈ 0.5 MB/year); runs are daily rather than real-time; concurrency must be serialised (`concurrency` group, `stateVersion` lock).
- Option 1 was rejected because it cannot keep effective dates or history past API windows. Option 3 was rejected because no current requirement needs it; it becomes relevant only with multi-user features. The pure engine (ADR-0005) keeps option 3 open.
