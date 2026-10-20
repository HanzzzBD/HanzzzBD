# ADR-0008: Split the workflow into a read-only build job and a write-only publish job

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The build job processes untrusted API data and runs third-party dependencies. The commit step needs write access.

## Decision

- `build`: `contents: read, actions: read`; checkout with `persist-credentials: false`; runs the whole pipeline; uploads an artifact with changed files and a manifest.
- `publish`: `contents: write`; no API reads, no project dependencies; a small verifier checks paths against an allow-list, README bytes outside the markers, checksums and the `stateVersion` lock; then commits and pushes.
- Triggers: `schedule` and `workflow_dispatch` only; `concurrency: legends`; timeouts on both jobs.

## Consequences

- Positive: code that touches untrusted input never holds a write token.
- Negative: artifact hand-off adds about 20–40 s per run.
