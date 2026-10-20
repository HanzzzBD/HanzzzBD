# ADR-0007: TypeScript on Node 24 LTS with native type stripping, pnpm and minimal dependencies

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The owner's stack is TypeScript, Node and pnpm. Supply-chain exposure should be small, and the build pipeline simple.

## Decision

- Node **24 LTS**, running `.ts` directly via Node's built-in type stripping (no bundler or transpile step). The tsconfig sets `erasableSyntaxOnly` (no enums or parameter properties); `tsc --noEmit` typechecks in CI.
- **pnpm** with a frozen lockfile and `--ignore-scripts`.
- Runtime deps: `@octokit/core`, `@octokit/plugin-retry`, `@octokit/plugin-throttling`, `yaml`, `zod`. Dev deps: `typescript`, `vitest`, `fast-check`, `@biomejs/biome`. No SVG, Markdown or template libraries (ADR-0010).
- A new runtime dependency requires an ADR.

## Consequences

- Positive: no build artifacts; a small attack surface; familiar stack.
- Negative: type stripping forbids some TypeScript syntax; Node's type-stripping support must be confirmed on the runner's Node 24 (part of the B-01 spike).
