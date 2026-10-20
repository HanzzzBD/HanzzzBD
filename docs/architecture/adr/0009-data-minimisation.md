# ADR-0009: Store the minimum data and redact on visibility loss

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The repo and its state are public. Repos can later become private or be deleted. Commit messages and titles can contain sensitive text.

## Decision

- Never store commit messages, PR, issue or release titles and bodies, branch names, emails or file paths (except marker file names). Messages are used in memory only (automation signal, fingerprint hash).
- Records from private repos are dropped at normalisation; only the aggregate private count is kept.
- When a known repo becomes inaccessible, a redaction revision removes its name and details; outputs show "private contribution".
- Allies: login and user id only.

## Consequences

- Positive: minimal privacy exposure; smaller state.
- Negative: highlights cannot quote PR titles (they use generated labels); git history retains names of repos that were public at the time (documented).
