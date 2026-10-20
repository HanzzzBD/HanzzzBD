# ADR-0010: Render SVG and Markdown through typed, escaping builders

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Repository names, tags, logins and config strings are untrusted and flow into SVG, Markdown and logs.

## Decision

- SVG: a minimal typed node builder; text and attribute escaping at the boundary; per-element attribute allow-lists; colours only from tokens; no data-driven `href`, `style`, `<script>`, `<foreignObject>` or event attributes; canonical serialisation.
- Markdown: context-aware escaping; a link builder restricted to GitHub URLs and fixed relative paths.
- A post-render validator parses all outputs and rejects violations before publish.
- No third-party template engines.

## Consequences

- Positive: injection is structurally prevented and independently validated.
- Negative: more renderer code to write; components are code rather than editable templates.
