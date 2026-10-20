# ADR-0004: Store state on `main` and publish state and outputs in one atomic commit

- **Status:** Accepted (owner, 2026-10-20)
- **Date:** 2026-10-20

## Context

State (ledger, events, snapshot, meta) must stay consistent with the rendered README and assets. A separate data branch would need two pushes that can diverge.

## Decision

`legends/state/**` lives on `main`. Each successful run produces exactly one commit containing state + `assets/legends/**` + `docs/legends/**` + the README block. Unchanged outputs and state → no commit.

## Consequences

- Positive: state and outputs can never disagree; `git revert` of a bot commit restores a consistent pair.
- Negative: daily bot commits appear in `main` history (small diffs). Accepted (Phase 00 D-05).
