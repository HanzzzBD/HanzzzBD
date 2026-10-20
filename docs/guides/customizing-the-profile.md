# Customizing your GitHub Legends profile

Your profile README has two kinds of content:

- **Your own content**: everything outside the markers. Write it however you like; GitHub Legends never touches it.
- **The generated block**: everything between `<!-- LEGENDS:START -->` and `<!-- LEGENDS:END -->`. It is rewritten on every run, so **never edit inside the markers**. Your changes would be overwritten.

## 1. Move the block

Cut the three lines below and paste them anywhere in `README.md`, each on its own line:

```html
<!-- LEGENDS:START -->
<!-- GitHub Legends block: … -->
<!-- LEGENDS:END -->
```

Keep exactly one START and one END marker. With none, two, or the wrong order, the generator refuses to change the README and reports a marker error.

## 2. Change the layout: `legends/templates/readme-block.md`

The template is ordinary Markdown with placeholders. Reorder lines, add your own text, or delete optional sections.

| Placeholder | Renders |
| --- | --- |
| `{{section:<id>}}` | One section (see the list below) |
| `{{cards:lobby}}`, `{{cards:heroes,medals}}` | A centred row of cards; on phones they stack |
| `{{value:name}}`, `{{value:login}}`, `{{value:level}}`, `{{value:rank}}`, `{{value:bp}}`, `{{value:season}}`, `{{value:updated}}` | One escaped value, for your own sentences, e.g. `Welcome to {{value:name}}'s lobby` |
| `{{banner}}` | Sample-data and stale-data notices (keep it) |
| `{{footer}}` | Provenance legend, how-it-works link, update time (keep it) |

**Section ids:** `lobby`, `statistics`, `level`, `rank`, `season`, `heroes`, `mastery`, `emblems`, `equipment`, `quests`, `medals`, `map`, `battles`, `squad`, `identity`.

Rules, checked by `pnpm check:readme` and by every run:

- Each enabled section must appear exactly once. To drop a section, disable it in the config (§3) *and* remove its line from the template.
- Unknown placeholders and stray `{{` or `}}` are errors, so typos cannot leak into your profile.
- Use only HTML that GitHub keeps: `<p align>`, `<details>`, `<summary>`, `<sub>`, `<b>`, `<picture>`, `<img>`. Inline styles, scripts and iframes are rejected.
- Leave a blank line between HTML blocks and Markdown.

## 3. Settings: the `readme` section of the player config

| Key | Default | Meaning |
| --- | --- | --- |
| `login` | — (required) | Your GitHub login, used only for the profile link |
| `displayName` | the login | Name on the player card (emoji are removed in images) |
| `timezoneLabel` | `WIB` for Asia/Jakarta | Label in "updated …" lines |
| `disable` | `[]` | Sections to leave out, e.g. `[battles, equipment]` |
| `enable` | `[]` | Optional sections to turn on. Today that is only `squad` |
| `featuredRepos` | `4` | Public repositories listed in the identity section (0–8; 0 hides the list) |
| `staleAfterDays` | `3` | After this many days without a complete refresh, the profile says the data may be stale |

```yaml
readme:
  login: HanzzzBD
  displayName: Hadrian
  disable: [battles]
  enable: [squad]
  featuredRepos: 3
```

> The settings schema is implemented and validated (unknown keys are errors). The file loader arrives with the command-line runner; until then these keys are the specification.

Other choices live in the engine config:

- `heroes.main` and `heroes.hide`;
- `emblem.active`;
- `build` (your equipped verified tools);
- `declaredTools` (shown with ✎, never rewarded).

None of them can add EXP, levels, ranks, medals or unlocks.

## 4. What you cannot change (by design)

- Numbers. Levels, ranks, stars, medals and statistics come only from verified GitHub activity. The template and config can hide them, never edit them.
- The provenance marks (✔ verified, Σ derived, ✎ self-declared) and the "not assessed skill" notes.
- Theme colours and card art: they come from the design tokens, so every card stays readable in dark and light mode.

## 5. Preview and validate before you push

```bash
cd legends
pnpm install
pnpm preview:readme   # writes preview/readme/: README.md, block.md, cards, validation.md
pnpm check:readme     # validates ../README.md
pnpm check            # typecheck, lint, tests and README check
```

`preview/readme/README.md` is your README with a **sample** block injected. Open it on GitHub to see it rendered with your real intro; every number in it is sample data and labelled so.

## 6. Your existing content

Your intro, links, tech stack, the real "🏆 Achievements" table and the third-party stat cards stay exactly as they are. Game achievements are called **Medals** so they never mix with your real-world achievements. If you later want the GitHub Legends cards to replace the third-party stat cards, remove those lines yourself; the generator will not.
