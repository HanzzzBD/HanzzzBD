# ADR-0011: Express rules and catalogs as versioned, schema-validated data with a closed condition DSL

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Values will be tuned after Season 1 (economy §6). Changes must be prospective and auditable (PRD §8).

## Decision

Rules live in `legends/rules/v<major>/*.yml` with a semantic version. Quest, medal and campaign conditions use a closed declarative vocabulary (`count`, `distinct`, `sum`, `all`, `any`, `streak`, `reach`, `ref`) interpreted by the engine. Ledger entries record `ruleVersion`. A new major version is a new directory; old versions stay readable for audits.

## Consequences

- Positive: tuning without code changes; schema-checked; test tables derive from the same data.
- Negative: the DSL must be kept small; complex rules still need code (for example battles, caps).
