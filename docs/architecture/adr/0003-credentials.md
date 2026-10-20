# ADR-0003: Use GITHUB_TOKEN first, with a no-permission fine-grained PAT as fallback

- **Status:** Accepted (owner, 2026-10-20)
- **Date:** 2026-10-20

## Context

Under D-02 only public data plus the public `restrictedContributionsCount` is needed. A long-lived PAT adds rotation burden and leak risk.

## Decision

The `build` job uses the workflow's `GITHUB_TOKEN` with `contents: read, actions: read`. If the B-01 spike shows that `GITHUB_TOKEN` cannot read the needed user-level GraphQL data, or its rate limit is insufficient for backfill, the fallback is a **fine-grained PAT with access to public repositories only and no repository permissions**, stored as `LEGENDS_READ_TOKEN` and exposed only to the collect step.

## Consequences

- Positive: zero secrets in the default setup; the token expires with the job.
- Negative: `GITHUB_TOKEN` rate limits are lower (≈ 1,000 requests per hour per repository); backfill may take several runs (resumable, ADR-0012).
