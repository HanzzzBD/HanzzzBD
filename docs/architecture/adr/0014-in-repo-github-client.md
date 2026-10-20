# ADR-0014: Use a small in-repo GitHub client instead of Octokit

- **Status:** Accepted (amends the dependency list of ADR-0007)
- **Date:** 2026-10-20

## Context

ADR-0007 planned `@octokit/core` with the retry and throttling plugins. While implementing the collection layer (Phase 05), the requirements turned out to centre on behaviour those plugins hide or make hard to test: hard page caps on every paginated call, a per-run request budget that counts retries, stopping before the rate-limit reserve, refusing pagination links to other origins, size caps, schema validation, and error messages that never contain URLs or response text. The throttling plugin also brings its own scheduling dependency.

## Decision

Implement `legends/src/github/client.ts`: a fetch-based client (about 350 lines) with an injectable transport, sleep, random and clock, providing `rest`, `paginateRest`, `graphql` and `paginateGraphql`. Runtime dependencies are now `zod` only (plus `yaml` when the config loader lands).

## Consequences

- Positive: every reliability and safety rule is explicit and covered by unit tests; deterministic tests (injected sleep and random); a smaller supply chain.
- Negative: the project maintains its own retry and rate-limit logic and must track GitHub API header changes. Mitigated by contract tests and the small surface.
