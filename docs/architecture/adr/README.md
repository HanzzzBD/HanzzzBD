# Architecture Decision Records

Format: context, decision, consequences. Status values: Proposed, Accepted, Superseded.

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-0001](0001-architecture-style.md) | Use GitHub Actions with state persisted in the repository | Accepted |
| [ADR-0002](0002-code-location.md) | Keep the engine inside the profile repository under `legends/` | Accepted (owner, 2026-10-20) |
| [ADR-0003](0003-credentials.md) | Use GITHUB_TOKEN first, with a no-permission fine-grained PAT as fallback | Accepted (owner, 2026-10-20) |
| [ADR-0004](0004-state-on-main.md) | Store state on `main` and publish state and outputs in one atomic commit | Accepted (owner, 2026-10-20) |
| [ADR-0005](0005-pure-engine.md) | Implement the game engine as pure functions with an injected clock | Accepted |
| [ADR-0006](0006-idempotency.md) | Prevent duplicate rewards with idempotency keys and append-only cap allocation | Accepted |
| [ADR-0007](0007-runtime-and-tooling.md) | TypeScript on Node 24 LTS with native type stripping, pnpm and minimal dependencies | Accepted |
| [ADR-0008](0008-two-job-workflow.md) | Split the workflow into a read-only build job and a write-only publish job | Accepted |
| [ADR-0009](0009-data-minimisation.md) | Store the minimum data and redact on visibility loss | Accepted |
| [ADR-0010](0010-safe-rendering.md) | Render SVG and Markdown through typed, escaping builders | Accepted |
| [ADR-0011](0011-ruleset-as-data.md) | Express rules and catalogs as versioned, schema-validated data with a closed condition DSL | Accepted |
| [ADR-0012](0012-collection-strategy.md) | Hybrid GraphQL/REST collection with watermarks and resumable backfill | Accepted |
| [ADR-0013](0013-testing-approach.md) | Test offline with recorded fixtures, properties and golden files | Accepted |
