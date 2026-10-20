# GitHub Legends — Information Architecture

- **Version:** 0.1 · **Date:** 2026-10-20
- How the 14 primary screens map onto the surfaces GitHub allows, how people move between them, and what each one contains.

## 1. Surfaces

GitHub Legends has no web app (D-01). "Screens" are realised on three static surfaces, all served by GitHub from this repository:

| Level | Surface | Path | Role |
| --- | --- | --- | --- |
| **L0** | Profile README (the "lobby") | `README.md` (between `LEGENDS` markers) | The 5-second overview; entry point to everything |
| **L1** | Generated hub pages (Markdown) | `docs/legends/*.md` | One page per system: full collection, history and explanations |
| **L2** | Generated detail pages (Markdown) | `docs/legends/<system>/<item>.md` | One hero, one region, one season archive |
| Assets | Generated SVGs | `assets/legends/{dark,light}/*.svg` | Images used by L0 to L2 |

GitHub renders Markdown pages in the repository with the same sanitiser as the README, so L1 and L2 pages follow the same constraints (`readme-layout.md` §1).

## 2. Sitemap

```
README (L0) — Player lobby
├── docs/legends/index.md ............ Legends home: all systems, how-it-works link
├── docs/legends/profile.md .......... Player statistics (full)
├── docs/legends/rank.md ............. Rank progression, trials, season ladder
├── docs/legends/map/index.md ........ World map (full + region table)
│   └── map/<region-slug>.md ......... Region detail: checkpoints, evidence
├── docs/legends/heroes/index.md ..... Hero collection
│   └── heroes/<hero-slug>.md ........ Hero detail and mastery
├── docs/legends/emblems.md .......... Emblem system
├── docs/legends/equipment.md ........ Equipment inventory and build
├── docs/legends/quests.md ........... Quest board, campaigns, contracts
├── docs/legends/medals.md ........... Medal gallery (achievement gallery)
├── docs/legends/seasons/index.md .... Season overview
│   └── seasons/S<n>.md .............. Season archive (immutable)
├── docs/legends/squad.md ............ Squad information
├── docs/legends/battles.md .......... Battle history (full log)
├── docs/legends/records.md .......... Leaderboard (personal records and ladders)
├── docs/legends/shop.md ............. Shop catalog and purchase how-to (P1)
├── docs/legends/ledger.md ........... Ledger summary (transparency)
└── docs/legends/how-it-works.md ..... Rules in plain language, provenance legend
```

## 3. Screen inventory (14 primary screens)

| # | Screen | L0 presence (README) | L1/L2 page | Primary question answered |
| --- | --- | --- | --- | --- |
| 1 | **Player lobby** | The whole Legends block | `index.md` | Who is this player, and how far along are they? |
| 2 | **Player statistics** | Player card stat tiles + text summary | `profile.md` | What are the verified numbers? |
| 3 | **Rank progression** | Season card (crest, stars, trial) | `rank.md` | Where am I this season, and what's needed to climb? |
| 4 | **World map** | Collapsed `<details>` with the map SVG + region text list | `map/index.md`, `map/<region>.md` | How far have I travelled, and what's next? |
| 5 | **Hero collection** | Hero lineup card (top 3) | `heroes/index.md` | Which technologies do I work with? |
| 6 | **Hero mastery** | Mastery tier and MP inside the lineup tiles | `heroes/<hero>.md` | How deep is my verified activity per technology? |
| 7 | **Emblem system** | Active emblem chip on the player card; collapsed "Build and Emblems" | `emblems.md` | What's my specialisation? |
| 8 | **Equipment inventory** | Collapsed "Build and Emblems" (build row SVG) | `equipment.md` | Which tools are verified in my projects? |
| 9 | **Quest board** | "Today's quests" (Markdown, visible) | `quests.md` | What can I do today and this week? |
| 10 | **Achievement gallery** | Medals strip card (recent and rarest) | `medals.md` | What have I earned? |
| 11 | **Season overview** | Season card header + collapsed "Season" line | `seasons/index.md`, `seasons/S<n>.md` | How is this season going; how did past ones end? |
| 12 | **Squad information** | Collapsed "Squad" (Markdown list) | `squad.md` | Who do I build with? |
| 13 | **Battle history** | Collapsed "Battle history" (last 10, Markdown table) | `battles.md` | What happened recently? |
| 14 | **Leaderboard** | Collapsed "Records" (Markdown table) | `records.md` | Am I beating my own bests? |

## 4. Content priority (README, VD-04 compact)

| Order | Content | Visibility | Why |
| --- | --- | --- | --- |
| 1 | Player card + season card (row of two) | Visible | Identity, level, rank: the 5-second read |
| 2 | One-line text summary | Visible | Accessibility, image-blocked clients, search |
| 3 | Hero lineup + medals strip (row of two) | Visible | Technology story + collection pride |
| 4 | Today's quests (+ featured campaign step) | Visible | The reason to come back |
| 5 | World map | `<details>` | Large; exploratory |
| 6 | Battle history | `<details>` | Detail |
| 7 | Build and Emblems | `<details>` | Detail |
| 8 | Squad | `<details>` | Involves other people; opt-in feel |
| 9 | Records | `<details>` | Detail |
| 10 | Footer (provenance, freshness, links) | Visible, small | Trust |

## 5. Navigation model

- **Down:** each README card is wrapped in a link to its L1 page (`<a href="docs/legends/heroes/index.md"><picture>…</picture></a>`). Every `<details>` section ends with "Open full <screen> →".
- **Across:** every L1 page starts with a **breadcrumb** (`Legends › Heroes`) and a compact **tab row** of links to the other L1 pages (Markdown links separated by " · ").
- **Up:** every L1 and L2 page has "← Back to profile" (link to `https://github.com/<login>`) and "← Legends home".
- **Deep links to evidence:** detail pages link to the GitHub object behind a verified fact (commit, PR, release) **only for public repositories**. Private evidence is shown as "private contribution" with no link (D-02).

## 6. Primary journeys

### 6.1 Visitor (recruiter or peer), about 30 seconds

1. Scrolls past the owner's intro and sees the player card: name, level, rank, BP, streak.
2. Reads the hero lineup: "TypeScript, Python, PHP": the stack, with verified depth.
3. Glances at the medals strip and today's quests (activity is current).
4. Optional: opens "World map" or "Battle history".
5. Optional: clicks the hero lineup to open the hero collection.

### 6.2 Player (owner), daily check, about 1 minute

1. Opens the profile and reads today's quests and progress.
2. Checks the season card: trial progress and stars this week.
3. Opens `quests.md` for the weekly board and campaigns.
4. To spend BP: opens `shop.md`, copies an item ID into the config purchase list, and commits. The next run settles it. The result shows in the run summary and on the player card's "last transaction" line (on `profile.md`).

### 6.3 Player, season end

1. Opens `seasons/index.md` and sees the closed season's archive link, rewards and new starting rank.
2. Opens the archive `seasons/S<n>.md` (immutable).

## 7. Labels and terminology (UI copy glossary)

| Concept | UI label | Never say |
| --- | --- | --- |
| Game achievements | **Medals** | "Achievements" (reserved for the owner's real awards) |
| Mastery tier | "Veteran mastery" | "Expert developer", "skilled in" |
| Level | "Level 13" | "Seniority", "skill level" |
| Self-declared items | "Declared kit" | "Skills", "expertise" |
| Personal records | "Records", "Personal bests" | "Ranking vs others", "Top developer" |
| Battles | "Battle", "Victory", "MVP", "Skirmish" | "Defeat" (no defeats exist) |
| Stale data | "Data may be stale (last refresh …)" | Silent omission |

## 8. Data freshness and provenance in the IA

- Every L0 card and L1 page shows "as of <time> WIB" where values change daily.
- The provenance legend (✔ Verified · Σ Derived · ✎ Self-declared) appears in the README footer and at the top of every L1 page.
- Health states: `fresh` (≤ 26 h), `stale` (> 3 days, warning banner), `failed-run` (last run failed; values from the previous successful run are shown with the warning).
