# ADR-0005: Implement the game engine as pure functions with an injected clock

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Determinism and reproducibility are architectural goals. Business rules are numerous and must be exhaustively testable.

## Decision

`normalize`, `engine`, `derive`, `render` and `validate` are pure: no I/O, no `Date.now()`, no randomness. `runAt` is captured once by the CLI and passed in. Seeds for quest boards come from stable hashes. Inputs are sorted canonically before evaluation, and outputs use canonical JSON and canonical SVG serialisation.

## Consequences

- Positive: byte-identical outputs for identical inputs; offline tests; future portability (ADR-0001 option 3).
- Negative: I/O code must assemble complete inputs up front; slightly more plumbing in `cli`.
