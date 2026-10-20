# GitHub Legends — Testing Strategy

- **Version:** 0.1 · **Date:** 2026-10-20
- **Principle:** the game is pure logic over recorded data, so almost everything is testable offline, deterministically and fast. **CI never calls the live GitHub API.**
- **Traceability:** every acceptance criterion in `docs/product/acceptance-criteria.md` maps to at least one test whose name starts with its ID (for example `AC-SYS13-01 day score thresholds`). A CI script fails if a P0 criterion has no test.

## 1. Test pyramid

| Layer | Tool | Scope | Approx. share |
| --- | --- | --- | --- |
| Unit (table-driven) | Vitest | `core` time maths, each engine evaluator, config and ruleset schemas, builders and escapers | 55% |
| Property-based | fast-check | Engine invariants, escaping, determinism | 10% |
| Golden (snapshot) | Vitest + committed golden files | SVG components (both themes), Markdown pages, README block | 15% |
| Contract (collectors) | Vitest + recorded fixtures via an injected `fetch` | GraphQL and REST parsing, pagination, error mapping, budget handling | 10% |
| Scenario (economy) | Vitest | GDD profiles A–F over 4 simulated seasons | 5% |
| End-to-end offline | CLI `legends run --fixtures --now <instant>` | Full pipeline: state in → output tree out, compared to a golden directory | 5% |
| Live smoke (manual) | `workflow_dispatch` mode `dry-run` | Real API, no publish; reviews the job summary | Manual, before going live and after major changes |

## 2. Engine tests

- **Table tests from the design tables:** level thresholds (progression-tables §1), star thresholds and soft reset (§2), battle results (§2.1), mastery and emblem tiers, item tiers, map gates. The tables are loaded from `rules/v1` and asserted against hard-coded expected rows copied from the docs, so a ruleset typo fails a test.
- **Acceptance criteria** AC-CORE-*, AC-SYS*-*, AC-GDD-* as named tests.
- **Edge cases:** midnight boundaries in Asia/Jakarta (23:59:59 vs 00:00:00), ISO-week year boundaries (2026 **has** a week 53, 2026-12-28 → 2027-01-03, which **straddles the S1/S2 season boundary**: the weekly star and BP caps stay per ISO week, while stars are attributed to the season of each battle's player day; 2027-W01 starts 2027-01-04), season boundary with late events, backdated commits, a missed day, all sources failed, period closure guard with a partial source.

## 3. Determinism and idempotency tests

| Property | Test |
| --- | --- |
| **Idempotency** | For random event sets E: `engine(E, ledger)` then `engine(E, ledger + new)` → the second run adds 0 entries |
| **Input-order independence** | Shuffling the event array and config list order gives an identical ledger and outputs |
| **Byte determinism** | Rendering the same snapshot twice gives identical bytes; same in two processes (CI runs the e2e twice and diffs) |
| **Clock injection** | A lint rule forbids `Date.now`, `new Date()` with no arguments, and `Math.random` outside `cli`; a test greps the built module graph |
| **Recompute equivalence** | `derive(ledger)` equals the stored `snapshot.json` after each e2e step (`legends verify`) |
| **Append-only** | After any run, the old ledger is a prefix of the new ledger (per partition) |

## 4. Invariant (property) tests with fast-check

- BP balance never negative; weekly star cap never exceeded; daily commit EXP ≤ 75.
- EXP and level are monotonic non-decreasing across runs.
- Rank never decreases within a season.
- Σ mastery points ≤ Σ commit EXP (AC-SYS06-01).
- Every non-zero EXP entry references a qualifying event.
- Quest board generation: same seed → same board; boards never contain ineligible quests or duplicates.
- **Anti-manipulation:** for generated "spam" streams (thousands of tiny commits, scripted self-merged PRs, release spam), the final rank stays ≤ Warden I without contested objectives (GDD economy §4).

## 5. Renderer and security tests

- **Golden files:** `test/golden/{dark,light}/*.svg`, `test/golden/pages/*.md`, `test/golden/readme-block.md`. Updating them needs an explicit `pnpm test -u` and shows up in the PR diff.
- **SVG validator tests:** each golden SVG parses as strict XML; no forbidden elements or attributes; no external URLs (the only allowed `http` string is the SVG namespace URI); size ≤ budget; essential text ≥ 11 px (checked via font-size attributes of elements tagged `data-essential`, stripped in production).
- **Injection fuzzing:** fast-check generates hostile strings (`<script>`, `"><svg onload=…>`, `]]>`, `<!-- LEGENDS:END -->`, `::set-output`, `%0A::error::`, bidi overrides, 10 KB strings, `javascript:` links) and injects them as repo names, tags, logins, display names and mottos. Assertions:
  1. every SVG still parses and contains no forbidden constructs;
  2. Markdown output contains no unescaped `<`, no new markers and no links outside the allowed URL builder patterns;
  3. log lines contain no `::` command sequences or raw newlines.
- **Marker injector tests:** missing, duplicated, reversed or nested markers → `MarkerError` and an unchanged README; content outside the markers is byte-identical (AC-SYS16-01/02).
- **Privacy tests:** fixtures with repos that turn private → no name in any output; no message or title fields anywhere in state (schema forbids them).
- **Accessibility tests:** every `<img>` has alt text equal to the SVG `<desc>` (≤ 600 characters); the token contrast table matches the WCAG thresholds (recomputed in a test).
- **Visual regression (P1, optional):** Playwright renders golden SVGs at 400 px and 375 px and compares against reference PNGs with a tolerance. Runs locally and in CI on renderer changes only.

## 6. Collector contract tests

- **Fixtures:** recorded responses from the B-01 spike, **scrubbed** (no tokens or headers beyond rate-limit fields; private data impossible by D-02; messages kept only in fixtures for the automation-signal tests, using synthetic repos where needed).
- **Injected transport:** `GitHubClient` takes a `fetch` implementation; tests use a fixture router keyed by method + URL + GraphQL operation name. Unmatched requests fail the test.
- **Cases:** pagination (multiple pages, empty pages), `since` overlap dedupe, 304 Not Modified, 404 repo (→ `sourceUnavailable`), 403 or secondary rate limit with `Retry-After`, 502 then success (retry), budget exhaustion → `partial` with the correct watermark, GraphQL partial errors (`errors[]` with `data`).

## 7. Workflow and repository checks (CI)

| Check | Tool |
| --- | --- |
| Typecheck | `tsc --noEmit` (strict, `erasableSyntaxOnly`) |
| Lint and format | Biome |
| Workflow lint | `actionlint` + a custom check: no `${{` inside `run:` except allow-listed constants; all `uses:` pinned to 40-character SHAs |
| Unit, property, golden, contract, scenario, e2e | Vitest |
| AC coverage | Script: every P0 AC ID has ≥ 1 test |
| Coverage | `engine`, `derive`, `render`, `validate` ≥ 95% lines; overall ≥ 85% |
| Secret scan | GitHub secret scanning (public repo) + `gitleaks` on PRs |
| Ruleset lint | Schema validation, the STK-11 campaign-vs-medal overlap check (AC-GDD-09), map slot spacing check |

## 8. Test data

- `test/fixtures/api/`: recorded GitHub responses (scrubbed).
- `test/fixtures/state/`: hand-written ledgers and event sets for scenarios (new player, mid-season, season boundary, backfill pending, corrupted checksum).
- `test/fixtures/profiles/`: the GDD economy profiles as event generators (deterministic seeds).
- All fixtures use sample identities (`sample-player`, user id 1000001). Real profile data is used only in the manual live smoke test and is never committed as fixtures beyond what the profile already makes public.

## 9. Definition of done (per feature)

1. Its acceptance criteria tests pass.
2. Golden outputs reviewed in the PR diff (both themes).
3. Invariant properties still hold.
4. `legends verify` passes on the e2e fixture state.
5. No new runtime dependency without an ADR.
