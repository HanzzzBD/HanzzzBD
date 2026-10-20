# GitHub Legends — Security Model

- **Version:** 0.1 · **Date:** 2026-10-20
- **Scope:** the scheduled generator, its CI, the committed state and the public outputs.

## 1. Assets and threats

| Asset | Threat | Impact |
| --- | --- | --- |
| Write access to the profile repo (token) | Token theft, misuse by a compromised dependency or injected command | Defacement, malicious commits |
| Private repository information | Leakage into public state or assets | Privacy breach (D-02) |
| Integrity of game state | Corruption, accidental edits, double awards | Wrong profile, loss of trust |
| Profile viewers | Injected markup or links in README or SVG | Phishing, deceptive content |
| Runner | Arbitrary command execution via workflow command or expression injection | Token misuse |

**Untrusted inputs:** all GitHub API data (repo names, tags, topics, logins, language names, counts from others' repos), repository file trees (P1), the player config (owner-controlled but still escaped), recorded fixtures, dependency code.

**Trusted inputs:** the ruleset and source code reviewed through git; the GitHub Actions platform.

## 2. Least privilege

| Context | Permissions | Credentials |
| --- | --- | --- |
| Workflow default | `permissions: {}` | — |
| Job `build` | `contents: read`, `actions: read` | `GITHUB_TOKEN` (read-only, expires at job end); `actions/checkout` with `persist-credentials: false` |
| Job `publish` | `contents: write` | `GITHUB_TOKEN`; makes **no** API reads and runs **no** project code beyond a small verifier script (§5) |
| CI workflow (`pull_request`, `push`) | `contents: read` | None besides the read-only token; never `pull_request_target`; fork PRs get no secrets |
| Fallback PAT (only if B-01 fails, or private repos are opted in) | Fine-grained, read-only; **no repository permissions** for public-only use, or **read access to exactly the allow-listed private repos** when §4.1 is enabled; ≤ 1-year expiry | Secret `LEGENDS_READ_TOKEN`, exposed only to the `build` job's collect step via `env` |
| Privacy salt (only with private repos) | — | Secret `LEGENDS_PRIVACY_SALT` (≥ 32 random characters); never logged or stored; rotating it changes all private pseudonyms |

Repository settings the owner should confirm (blocker B-06): Actions → default workflow permissions = **read** (jobs elevate explicitly); allow only actions pinned by SHA (optional "allowed actions" policy).

## 3. Secrets handling

- No secrets are needed in the default configuration (ADR-0003).
- Tokens are never written to disk, artifacts, state, logs or the job summary. The client receives the token through the environment and sends it only in the `Authorization` header, and only to the API origin (pagination links to other hosts are refused).
- The logger has a redaction filter for any value matching token formats (`ghp_`, `github_pat_`, `ghs_`) as a defence in depth; GitHub also masks registered secrets.
- `.gitignore` includes `.env*`, `out/`, `*.pem`, `*.key`. CI runs a **secret scan** step (gitleaks or GitHub secret scanning, which is enabled for public repos) on every PR.
- The upload artifact contains only generated files and the manifest. It is built from an explicit file list, never by globbing the workspace.

## 4. Privacy (no private information in public outputs)

1. **Collection boundary (D-02):** collectors request only public data. Any record whose repo has `isPrivate: true` is dropped at normalisation (defence in depth, in case a PAT with broader scope is ever used), except the user-level `restrictedContributionsCount` number.
2. **Data minimisation (ADR-0009):** commit messages, titles, bodies, branch names, file paths and emails are never stored. Messages are processed in memory for the automation signal and fingerprint, then dropped.
3. **Visibility loss:** a repo that becomes private or deleted gets a redaction revision (name and details dropped; ids and amounts kept) and is rendered as "private contribution". *Limitation:* data committed while the repo was public remains in git history. This is documented in `how-it-works.md` (it was public data at the time).
4. **Other people:** allies appear only by public login, with a hide list and an off switch. No avatars or stats of other users are fetched or stored.
5. **Output check:** the validator asserts that no repo name from the redacted set appears in any output file.

### 4.1 Private repositories (opt-in, implemented in Phase 05)

Private collection is **off by default** (D-02). It runs only when **all** of the following hold; otherwise the run fails closed with `not_authorized_private`:

1. `collection.privateRepos.enabled: true` and the repo is listed in `privateRepos.allow` (exact `owner/name`, no wildcards);
2. the secret `LEGENDS_PRIVACY_SALT` (≥ 32 characters) is provided to the build job;
3. the token can actually read the repo (`GET /repos/{owner}/{repo}` returns it with `private: true`; a 404 is reported as "not authorised" for that allow-list slot, without naming it).

When collected, private data is stored only in pseudonymous form:

- Repo id `p:<HMAC-SHA256(salt, repoId)>`; object ids (SHA, node id, release and run ids) are HMACs; fingerprints are HMACs (resists dictionary attacks on short messages).
- No name (unless in `privateRepos.allowPublicNames`, which must be a subset of `allow`), no PR or issue numbers, no release tags, no logins of other people.
- Language byte counts only with `privateRepos.includeLanguages: true`.
- Records about private repos found via user-level queries (PRs, reviews, issues) but not allow-listed are **dropped** and reported only as a count (`droppedPrivate`).
- `assertPrivacyInvariants` re-checks every event before the collection result is returned, and aborts on any violation.

Note: the default `GITHUB_TOKEN` cannot read the owner's other private repositories, so condition 3 also requires the fallback PAT (ADR-0003) with read access to exactly the allow-listed repos.

### 4.2 Collection client protections (implemented)

- The request budget per run (`limits.maxRequests`) counts retries; it stops before the rate-limit reserve (`minRemaining`).
- Every pagination call requires an explicit page cap (1–100); hitting it marks the unit `truncated` and the source `partial`.
- Pagination `Link` URLs must stay on the API origin, so the token is never sent to another host.
- Route parameters must match `^[A-Za-z0-9._-]{1,100}$` (no path traversal or query injection).
- Response bodies are size-capped (10 MB) and schema-validated. Validation errors report field paths, never values.
- GraphQL responses with any `errors` entry fail the call (no silent partial data); only error *type* codes are reported.
- Errors carry route templates, never expanded URLs, so private names never reach logs. Logs are JSON lines with workflow-command escaping and token redaction.

## 5. Untrusted content and injection defences

| Vector | Defence |
| --- | --- |
| **SVG/XML injection** (for example a repo name or tag containing `<script>`, quotes, entities) | SVG is built only through the typed builder: text nodes are XML-escaped (`& < > " '`); attribute values come from an allow-list per element and must be numbers, token colours or escaped strings; no `href`/`xlink:href`, `<script>`, `<foreignObject>`, `on*` attributes or `style` attributes from data; `<style>` blocks are static template content only. A post-render validator parses each SVG with a strict tokenizer (well-formedness plus the allow-lists) and rejects forbidden elements and attributes and any external URL. |
| **Markdown/HTML injection in README and pages** | Markdown builder escapes `\ ` * _ { } [ ] ( ) # + - . ! \| < > & ~` and line breaks in inline text; table cells also escape `\|`; link targets come only from a URL builder (`https://github.com/` + validated path segments `^[A-Za-z0-9._-]+$`, or relative paths from a fixed set); no raw HTML from data; `<` is always escaped, so data can never create `<!-- LEGENDS:END -->` or tags. |
| **Marker tampering** | The injector requires exactly one START before exactly one END; the generated block is checked to contain neither marker string. Otherwise `MarkerError`, and README is untouched. |
| **Workflow command injection** (`::set-output`, `::add-mask`, `::stop-commands`, `::error file=…` in stdout) | The logger escapes `%`→`%25`, `\r`→`%0D`, `\n`→`%0A` and neutralises `::` in all message content; logs are JSON lines (a line never starts with untrusted text); IDs and counts are logged rather than names; the job summary is Markdown-escaped. |
| **Expression injection in workflow YAML** (`${{ github.event.* }}` inside `run:`) | Triggers are only `schedule` and `workflow_dispatch` (choice inputs); inputs are passed via `env:` and validated in code against an enum; no `run:` step interpolates any `${{ }}` value other than constants. Checked with `actionlint` and a custom grep rule in CI. |
| **Path traversal / arbitrary file writes** | Output paths come only from catalog slugs (`^[a-z0-9-]+$`) and fixed templates; the writer resolves paths and asserts they stay under allowed roots; `publish` re-verifies the manifest against the allow-list: `README.md`, `assets/legends/**`, `docs/legends/**`, `legends/state/**`. |
| **README tampering outside markers** | `publish` compares the bytes before START and after END with `main`'s README; any difference aborts. |
| **Commit message injection** | Fixed template with a date and counts only. |
| **YAML parsing** | `yaml` library with the core schema (no custom tags, no merge keys by default), then zod with strict objects; size limit 64 KB per file. |
| **Regex DoS** | Automation patterns are literal substrings; no user-supplied regex anywhere. |
| **Huge or malicious API payloads** | Pagination caps per source; per-field length caps (tag ≤ 64, topic ≤ 50, login ≤ 39, repo name ≤ 100); counts validated as non-negative safe integers. |
| **Unicode tricks** (bidi controls, zero-width characters in names) | Strip bidi and zero-width control characters and normalise to NFC before rendering; render logins and repo names in ASCII-only contexts where applicable. |
| **Tree content (P1)** | Only file **paths** are matched against literal marker lists; file contents are never fetched in P1 (manifest parsing in P2 would parse JSON or TOML with size limits and no evaluation). |

## 6. Supply chain

- **Minimal runtime dependencies** (ADR-0007, amended by ADR-0014): `zod` only so far (`yaml` arrives with the config loader). The GitHub client is a small in-repo `fetch` wrapper instead of Octokit. Dev: `typescript`, `vitest`, `fast-check`, `@biomejs/biome`. The output validator is a small hand-rolled strict tokenizer for the generator's own canonical SVG (no XML library needed at runtime).
- `pnpm install --frozen-lockfile --ignore-scripts` (no install scripts run).
- All third-party actions pinned to full commit SHAs, with version comments; Dependabot for `github-actions` and `npm` updates (PRs run CI with read-only permissions).
- Node runtime pinned to a 24.x LTS via `actions/setup-node` with `node-version-file`.
- No network access in tests (enforced: the test setup replaces `fetch` with a throwing stub).

## 7. Integrity of state

- Per-file SHA-256 checksums in `meta.json`, verified at load; a mismatch → `StateIntegrityError` (catches accidental hand edits and partial writes).
- Append-only ledger invariants checked every run (data-model §3).
- Optimistic lock on `stateVersion` in publish.
- Atomic publish: state and outputs land in one commit or not at all.
- Recovery runbook (to be written in implementation): `legends verify`, and `git revert` of the last bot commit restores a consistent state + outputs pair.

## 8. Threat-specific residual risks (accepted)

| Risk | Why accepted |
| --- | --- |
| History retains data from repos that later turn private | Data was public; rewriting history is disproportionate. Documented. |
| A compromised dependency in the `build` job could exfiltrate the read-only token | Token scope is read-only and short-lived; publish is isolated; deps are minimal and pinned. |
| Owner edits state by hand to inflate numbers | Checksums detect accidental edits; deliberate self-cheating is out of scope (single-user product). |
