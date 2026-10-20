# ADR-0013: Test offline with recorded fixtures, properties and golden files

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Business logic is complex and must not regress. CI must be deterministic and must not depend on the live API or secrets.

## Decision

Use table-driven unit tests, fast-check properties (idempotency, invariants, anti-manipulation), golden outputs, contract tests with an injected `fetch` and recorded fixtures, offline end-to-end runs, and acceptance-criteria traceability. Live API checks are a manual `dry-run` dispatch only.

## Consequences

- Positive: fast, reliable CI; every acceptance criterion traceable.
- Negative: fixtures must be refreshed when the API changes; golden updates need careful review.
