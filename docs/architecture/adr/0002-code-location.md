# ADR-0002: Keep the engine inside the profile repository under `legends/`

- **Status:** Accepted (owner, 2026-10-20)
- **Date:** 2026-10-20

## Context

The engine could live in this profile repository or in a separate repository consumed as an Action or package. Reusability for other players is a later goal (D-01).

## Decision

Source code, ruleset, tests and state live under `legends/` in `HanzzzBD/HanzzzBD`. Module boundaries (system-architecture §5) are designed so that `core`, `engine`, `derive`, `render` and `ruleset` can later be extracted into a reusable package or Action without changes.

## Consequences

- Positive: one repo, one workflow, atomic commits, no cross-repo versioning or token scopes.
- Negative: GitHub's language bar for the profile repo will show TypeScript; the profile repo holds code and tests. Extraction later needs a packaging step.
