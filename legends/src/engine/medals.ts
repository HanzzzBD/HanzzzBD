/**
 * Medals (achievements) — docs/game-design/achievement-catalog.md, GDD §G.
 *
 * Every medal is a pure rule over ledger entries (activity that already passed qualification)
 * and verified events. It stores its evidence keys, its provenance (which ledger rules or
 * event types it read) and an earned-on day equal to the day of the qualifying event; the
 * ledger's `createdAt` records when the engine first noticed it. A medal tier is awarded
 * once (`medal|<id>|<tier>`); repeatable medals use the season as the tier.
 */
import type { ExpContext } from "./exp.ts";
import type { Facts } from "./facts.ts";
import { HEROES } from "./heroes/catalog.ts";
import type { SpecializationResult } from "./heroes/index.ts";
import type { LedgerEntry } from "./ledger.ts";
import type { SeasonState } from "./progression.ts";
import { countProgress, distinctProgress, type Progress } from "./quests/catalog.ts";
import { mondayOf } from "./quests/engine.ts";
import type { TierId } from "./rules.ts";
import { addDays, dayOf, daysBetween, isoWeek, seasonOf } from "./time.ts";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Rarity rewards (achievement-catalog §1). Rarity is a design target, not a population statistic. */
export const RARITY_REWARDS: Readonly<Record<Rarity, { bp: number; cosmetic: string | null }>> = {
  common: { bp: 25, cosmetic: null },
  uncommon: { bp: 50, cosmetic: null },
  rare: { bp: 100, cosmetic: "title_or_badge_style" },
  epic: { bp: 200, cosmetic: "frame" },
  legendary: { bp: 400, cosmetic: "animated_frame" },
};

export interface MedalContext {
  ctx: ExpContext;
  facts: Facts;
  spec: SpecializationResult;
  seasons: readonly SeasonState[];
}

interface TierDef {
  tier: string;
  rarity: Rarity;
  evaluate(c: MedalContext): Progress;
}

export interface MedalDef {
  id: string;
  name: string;
  tiers: TierDef[];
  /** Other medals that must already be earned (any tier). Tier n also requires tier n−1. */
  prerequisites: string[];
  hidden?: { hint: string };
  /** Ledger rules / event types the condition reads (verification provenance). */
  provenance: string[];
  available: boolean;
  unavailableReason?: string;
  /** Repeatable per season: tiers are generated from the seasons. */
  perSeason?: (c: MedalContext, season: SeasonState) => Progress;
  perSeasonRarity?: Rarity;
}

type Item = { day: string; id: string };
const items = (list: ReadonlyArray<{ day: string; id: string }>): Item[] =>
  list.map((x) => ({ day: x.day, id: x.id }));
const ledgerItems = (c: MedalContext, pred: (e: LedgerEntry) => boolean) =>
  c.ctx.ledger.entries.filter(pred).map((e) => ({ day: e.effectiveDay ?? "", id: e.id }));
const first = (list: Item[]) => countProgress(list, 1);
const single = (rarity: Rarity, evaluate: (c: MedalContext) => Progress): TierDef[] => [
  { tier: "-", rarity, evaluate },
];
const tiers = (
  spec: Array<[string, Rarity, number]>,
  source: (c: MedalContext) => Item[],
): TierDef[] =>
  spec.map(([tier, rarity, n]) => ({ tier, rarity, evaluate: (c) => countProgress(source(c), n) }));
const unavailable = (reason: string) => ({ available: false, unavailableReason: reason });
const victories = (c: MedalContext) =>
  [...c.facts.battles.values()]
    .filter((b) => b.victory)
    .map((b) => ({ day: b.day, id: b.victoryId ?? b.day }));
const reachedTier = (c: MedalContext, tier: TierId) =>
  first(
    c.seasons
      .map((s) => ({ day: s.reached[tier] ?? "", id: `${s.season.id}:${tier}` }))
      .filter((x) => x.day),
  );
const closedSeasons = (c: MedalContext) =>
  c.ctx.ledger.entries
    .filter((e) => e.rule === "season.close")
    .sort((a, b) => ((a.season ?? "") < (b.season ?? "") ? -1 : 1));
const tierIndex = (c: MedalContext, id: string) => c.ctx.rules.tiers.findIndex((t) => t.id === id);
const verifiedItem = (c: MedalContext, item: string) =>
  c.ctx.ledger.get(`equipment.tier|${item}|common`);
const today = (c: MedalContext) => dayOf(c.ctx.runMs, c.ctx.config.timezone);
const coverRoles = (c: MedalContext, rule: string, tier?: string) => {
  const list = ledgerItems(
    c,
    (e) => e.rule === rule && (tier === undefined || e.meta?.tier === tier),
  ).map((x) => {
    const hero = HEROES.find((h) => h.id === x.id.split("|")[1]);
    return { ...x, group: hero?.role ?? "" };
  });
  return distinctProgress(
    list.filter((x) => x.group),
    ROLE_COUNT,
  );
};
const ROLE_COUNT = 6;

function streakProgress(calendar: ReadonlyMap<string, number>, target: number): Progress {
  const days = [...calendar.entries()]
    .filter(([, n]) => n > 0)
    .map(([d]) => d)
    .sort();
  let run = 0;
  let previous = "";
  let best = 0;
  for (const day of days) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    previous = day;
    best = Math.max(best, run);
    if (run >= target)
      return { current: target, target, completedOn: day, evidence: [`cal:${day}`] };
  }
  return { current: best, target, completedOn: null, evidence: [] };
}

export const MEDALS: readonly MedalDef[] = [
  // 2.1 First steps
  {
    id: "M-001",
    name: "First Commit",
    tiers: single("common", (c) => first(items(c.facts.commits))),
    prerequisites: [],
    provenance: ["ledger:exp.commit"],
    available: true,
  },
  {
    id: "M-002",
    name: "First Victory",
    tiers: single("common", (c) => first(victories(c))),
    prerequisites: [],
    provenance: ["ledger:star.victory"],
    available: true,
  },
  {
    id: "M-003",
    name: "First Merge",
    tiers: single("common", (c) => first(items(c.facts.prs))),
    prerequisites: [],
    provenance: ["ledger:exp.pr"],
    available: true,
  },
  {
    id: "M-004",
    name: "First Review",
    tiers: single("uncommon", (c) => first(items(c.facts.reviews))),
    prerequisites: [],
    provenance: ["ledger:exp.review"],
    available: true,
  },
  {
    id: "M-005",
    name: "First Release",
    tiers: single("uncommon", (c) => first(items(c.facts.releases))),
    prerequisites: [],
    provenance: ["ledger:exp.release"],
    available: true,
  },
  {
    id: "M-006",
    name: "Problem Solver",
    tiers: single("common", (c) => first(items(c.facts.issuesResolved))),
    prerequisites: [],
    provenance: ["ledger:exp.issue_resolved"],
    available: true,
  },
  {
    id: "M-007",
    name: "First MVP",
    tiers: single("uncommon", (c) =>
      first(
        [...c.facts.battles.values()]
          .filter((b) => b.mvp)
          .map((b) => ({ day: b.day, id: b.mvpId ?? b.day })),
      ),
    ),
    prerequisites: ["M-002"],
    provenance: ["ledger:star.mvp"],
    available: true,
  },
  // 2.2 Volume families
  {
    id: "M-010",
    name: "Committed",
    tiers: tiers(
      [
        ["I", "common", 100],
        ["II", "rare", 1000],
        ["III", "epic", 5000],
      ],
      (c) => items(c.facts.commits.filter((x) => x.earned)),
    ),
    prerequisites: [],
    provenance: ["ledger:exp.commit (amount > 0)"],
    available: true,
  },
  {
    id: "M-011",
    name: "Integrator",
    prerequisites: [],
    provenance: ["ledger:exp.pr"],
    available: true,
    tiers: tiers(
      [
        ["I", "uncommon", 10],
        ["II", "rare", 50],
        ["III", "epic", 200],
      ],
      (c) => {
        const selfDays = new Set<string>();
        return items(
          c.facts.prs.filter(
            (p) => !p.self || (!selfDays.has(p.day) && selfDays.add(p.day) !== undefined),
          ),
        );
      },
    ),
  },
  {
    id: "M-012",
    name: "Reviewer",
    tiers: tiers(
      [
        ["I", "uncommon", 10],
        ["II", "rare", 50],
        ["III", "epic", 250],
      ],
      (c) => items(c.facts.reviews),
    ),
    prerequisites: [],
    provenance: ["ledger:exp.review"],
    available: true,
  },
  {
    id: "M-013",
    name: "Shipper",
    tiers: tiers(
      [
        ["I", "rare", 5],
        ["II", "epic", 25],
      ],
      (c) => items(c.facts.releases),
    ),
    prerequisites: [],
    provenance: ["ledger:exp.release"],
    available: true,
  },
  {
    id: "M-014",
    name: "Fixer",
    tiers: tiers(
      [
        ["I", "uncommon", 10],
        ["II", "rare", 50],
        ["III", "epic", 200],
      ],
      (c) => items(c.facts.issuesResolved),
    ),
    prerequisites: [],
    provenance: ["ledger:exp.issue_resolved"],
    available: true,
  },
  // 2.3 Consistency
  {
    id: "M-020",
    name: "Streak",
    prerequisites: [],
    provenance: ["events:contribution_day"],
    available: true,
    tiers: (
      [
        ["I", "common", 7],
        ["II", "rare", 30],
        ["III", "epic", 100],
        ["IV", "legendary", 365],
      ] as const
    ).map(([tier, rarity, n]) => ({
      tier,
      rarity,
      evaluate: (c: MedalContext) => streakProgress(c.facts.calendar, n),
    })),
  },
  {
    id: "M-021",
    name: "Weekly Warrior",
    prerequisites: [],
    provenance: ["ledger:star"],
    available: true,
    tiers: single("uncommon", (c) => {
      const weeks = new Map<string, { stars: number; day: string }>();
      for (const s of c.facts.stars) {
        const monday = mondayOf(s.effectiveDay ?? "");
        const w = weeks.get(monday) ?? { stars: 0, day: "" };
        w.stars += s.amount;
        if ((s.effectiveDay ?? "") > w.day) w.day = s.effectiveDay ?? "";
        weeks.set(monday, w);
      }
      const full = [...weeks.entries()]
        .filter(([, w]) => w.stars >= 5)
        .sort(([a], [b]) => (a < b ? -1 : 1));
      let run = 0;
      for (let i = 0; i < full.length; i++) {
        run = i > 0 && addDays(full[i - 1]?.[0] ?? "", 7) === full[i]?.[0] ? run + 1 : 1;
        if (run >= 4)
          return {
            current: 4,
            target: 4,
            completedOn: full[i]?.[1].day ?? null,
            evidence: full.slice(i - 3, i + 1).map(([m]) => `week:${isoWeek(m)}`),
          };
      }
      return { current: run, target: 4, completedOn: null, evidence: [] };
    }),
  },
  {
    id: "M-022",
    name: "Marathon Season",
    prerequisites: [],
    provenance: ["ledger:exp (battle scores)"],
    available: true,
    tiers: single("rare", (c) => {
      const hits = c.seasons
        .map((s) =>
          countProgress(
            [...c.facts.battles.values()]
              .filter((b) => b.day >= s.season.startDay && b.day <= s.season.endDay)
              .map((b) => ({ day: b.day, id: `battle|${b.day}` })),
            60,
          ),
        )
        .filter((p) => p.completedOn)
        .sort((a, b) => ((a.completedOn ?? "") < (b.completedOn ?? "") ? -1 : 1));
      return hits[0] ?? { current: 0, target: 60, completedOn: null, evidence: [] };
    }),
  },
  {
    id: "M-023",
    name: "Clean Sheet",
    prerequisites: [],
    provenance: ["ledger:exp (battle scores)", "ledger:season.close"],
    available: true,
    tiers: single("rare", (c) => {
      for (const close of closedSeasons(c)) {
        const s = c.seasons.find((x) => x.season.id === close.season);
        if (!s) continue;
        const battles = [...c.facts.battles.values()].filter(
          (b) => b.day >= s.season.startDay && b.day <= s.season.endDay,
        );
        if (battles.length >= 30 && battles.every((b) => b.victory))
          return { current: 1, target: 1, completedOn: s.season.endDay, evidence: [close.id] };
      }
      return { current: 0, target: 1, completedOn: null, evidence: [] };
    }),
  },
  // 2.4 Rank and seasons
  {
    id: "M-030",
    name: "Knighted",
    tiers: single("uncommon", (c) => reachedTier(c, "knight")),
    prerequisites: [],
    provenance: ["ledger:star", "ledger:objective"],
    available: true,
  },
  {
    id: "M-031",
    name: "Champion",
    tiers: single("rare", (c) => reachedTier(c, "champion")),
    prerequisites: ["M-030"],
    provenance: ["ledger:star", "ledger:objective"],
    available: true,
  },
  {
    id: "M-032",
    name: "Ascendant",
    tiers: single("epic", (c) => reachedTier(c, "ascendant")),
    prerequisites: ["M-031"],
    provenance: ["ledger:star", "ledger:objective"],
    available: true,
  },
  {
    id: "M-033",
    name: "Eternal",
    tiers: single("legendary", (c) => reachedTier(c, "eternal")),
    prerequisites: ["M-032"],
    provenance: ["ledger:star", "ledger:objective"],
    available: true,
  },
  {
    id: "M-034",
    name: "Season Finisher",
    prerequisites: [],
    provenance: ["ledger:season.close"],
    available: true,
    tiers: single("uncommon", (c) =>
      first(
        closedSeasons(c)
          .filter((e) => tierIndex(c, String(e.meta?.peakTier)) >= tierIndex(c, "knight"))
          .map((e) => ({ day: e.effectiveDay ?? "", id: e.id })),
      ),
    ),
  },
  {
    id: "M-035",
    name: "Veteran of Seasons",
    tiers: single("rare", (c) =>
      countProgress(
        closedSeasons(c).map((e) => ({ day: e.effectiveDay ?? "", id: e.id })),
        4,
      ),
    ),
    prerequisites: ["M-034"],
    provenance: ["ledger:season.close"],
    available: true,
  },
  {
    id: "M-036",
    name: "Contender",
    tiers: [],
    prerequisites: [],
    provenance: ["ledger:quest.complete (contracts)"],
    available: true,
    perSeasonRarity: "uncommon",
    perSeason: (c, s) => {
      const board = String(
        c.ctx.ledger.get(`quest.board|contract|${s.season.id}`)?.meta?.quests ?? "",
      )
        .split(",")
        .filter(Boolean);
      const done = board
        .map((q) => c.ctx.ledger.get(`quest|${q}|${s.season.id}`))
        .filter((e): e is LedgerEntry => e !== undefined);
      const last =
        done
          .map((e) => e.effectiveDay ?? "")
          .sort()
          .at(-1) ?? null;
      return {
        current: done.length,
        target: Math.max(2, board.length),
        completedOn: board.length >= 2 && done.length === board.length ? last : null,
        evidence: done.map((e) => e.id),
      };
    },
  },
  // 2.5 Heroes and mastery
  {
    id: "M-040",
    name: "Recruiter",
    tiers: tiers(
      [
        ["I", "common", 3],
        ["II", "rare", 6],
        ["III", "epic", 10],
      ],
      (c) => ledgerItems(c, (e) => e.rule === "unlock.hero"),
    ),
    prerequisites: [],
    provenance: ["ledger:unlock.hero"],
    available: true,
  },
  {
    id: "M-041",
    name: "Every Role",
    tiers: single("epic", (c) => coverRoles(c, "unlock.hero")),
    prerequisites: ["M-040"],
    provenance: ["ledger:unlock.hero"],
    available: true,
  },
  {
    id: "M-042",
    name: "Expert's Touch",
    tiers: single("rare", (c) =>
      first(ledgerItems(c, (e) => e.rule === "mastery.tier" && e.meta?.tier === "expert")),
    ),
    prerequisites: [],
    provenance: ["ledger:mastery.tier"],
    available: true,
  },
  {
    id: "M-043",
    name: "Virtuoso",
    tiers: single("epic", (c) =>
      first(ledgerItems(c, (e) => e.rule === "mastery.tier" && e.meta?.tier === "virtuoso")),
    ),
    prerequisites: ["M-042"],
    provenance: ["ledger:mastery.tier"],
    available: true,
  },
  {
    id: "M-044",
    name: "Exalted",
    tiers: single("legendary", (c) =>
      first(ledgerItems(c, (e) => e.rule === "mastery.tier" && e.meta?.tier === "exalted")),
    ),
    prerequisites: ["M-043"],
    provenance: ["ledger:mastery.tier"],
    available: true,
  },
  {
    id: "M-045",
    name: "Polyglot Week",
    prerequisites: [],
    provenance: ["ledger:exp.commit", "events:repo_snapshot"],
    available: true,
    tiers: single("uncommon", (c) => {
      const weeks = new Map<string, Array<Item & { group: string }>>();
      for (const x of c.facts.commits)
        for (const hero of c.facts.heroesByRepo.get(x.repo) ?? [])
          weeks.set(isoWeek(x.day), [
            ...(weeks.get(isoWeek(x.day)) ?? []),
            { day: x.day, id: x.id, group: hero },
          ]);
      const hits = [...weeks.values()]
        .map((list) => distinctProgress(list, 3))
        .filter((p) => p.completedOn)
        .sort((a, b) => ((a.completedOn ?? "") < (b.completedOn ?? "") ? -1 : 1));
      return hits[0] ?? { current: 0, target: 3, completedOn: null, evidence: [] };
    }),
  },
  // 2.6 Emblems
  {
    id: "M-050",
    name: "Attuned",
    tiers: single("common", (c) => first(ledgerItems(c, (e) => e.rule === "emblem.attune"))),
    prerequisites: [],
    provenance: ["ledger:emblem.attune"],
    available: true,
  },
  {
    id: "M-051",
    name: "Specialist",
    tiers: single("uncommon", (c) =>
      first(ledgerItems(c, (e) => e.rule === "emblem.level" && e.meta?.level === 5)),
    ),
    prerequisites: [],
    provenance: ["ledger:emblem.level"],
    available: true,
  },
  {
    id: "M-052",
    name: "Master Specialist",
    tiers: single("epic", (c) =>
      first(ledgerItems(c, (e) => e.rule === "emblem.level" && e.meta?.level === 10)),
    ),
    prerequisites: ["M-051"],
    provenance: ["ledger:emblem.level"],
    available: true,
  },
  {
    id: "M-053",
    name: "Both Ends",
    tiers: single("rare", (c) => first(ledgerItems(c, (e) => e.id === "emblem.level|fullstack|5"))),
    prerequisites: [],
    provenance: ["ledger:emblem.level"],
    available: true,
  },
  {
    id: "M-054",
    name: "Many Paths",
    prerequisites: [],
    provenance: ["ledger:emblem.level"],
    available: true,
    tiers: single("epic", (c) =>
      distinctProgress(
        ledgerItems(c, (e) => e.rule === "emblem.level" && e.meta?.level === 3).map((x) => ({
          ...x,
          group: x.id.split("|")[1] ?? "",
        })),
        4,
      ),
    ),
  },
  // 2.7 Collaboration
  {
    id: "M-060",
    name: "Collaborator",
    tiers: single("uncommon", (c) => first(items(c.facts.prs.filter((p) => p.external)))),
    prerequisites: [],
    provenance: ["ledger:exp.pr", "events:pull_request"],
    available: true,
  },
  {
    id: "M-061",
    name: "Open Source Regular",
    prerequisites: [],
    provenance: ["ledger:exp.pr", "events:pull_request"],
    available: true,
    tiers: single("epic", (c) => {
      const ext = c.facts.prs.filter((p) => p.external);
      const count = countProgress(items(ext), 10);
      const repos = distinctProgress(
        ext.map((p) => ({ day: p.day, id: p.id, group: p.repo })),
        3,
      );
      const day =
        count.completedOn && repos.completedOn
          ? count.completedOn > repos.completedOn
            ? count.completedOn
            : repos.completedOn
          : null;
      return {
        current: Math.min(count.current, 10),
        target: 10,
        completedOn: day,
        evidence: count.evidence,
      };
    }),
  },
  {
    id: "M-062",
    name: "Peer Reviewer",
    tiers: single("rare", (c) =>
      distinctProgress(
        c.facts.reviews
          .filter((r) => r.prAuthorId !== null)
          .map((r) => ({ day: r.day, id: r.id, group: String(r.prAuthorId) })),
        5,
      ),
    ),
    prerequisites: [],
    provenance: ["ledger:exp.review", "events:review"],
    available: true,
  },
  {
    id: "M-063",
    name: "Co-Op",
    tiers: single("uncommon", (c) => first(items(c.facts.commits.filter((x) => x.coAuthored)))),
    prerequisites: [],
    provenance: ["ledger:exp.commit", "events:commit (co-authors)"],
    available: true,
  },
  {
    id: "M-064",
    name: "Squad of Four",
    tiers: single("rare", () => countProgress([], 1)),
    prerequisites: [],
    provenance: [],
    ...unavailable("The squad system is not implemented"),
  },
  {
    id: "M-065",
    name: "Community Pillar",
    tiers: single("epic", (c) =>
      countProgress(items(c.facts.issuesResolved.filter((i) => i.authorOther)), 25),
    ),
    prerequisites: [],
    provenance: ["ledger:exp.issue_resolved", "events:issue"],
    available: true,
  },
  // 2.8 Quests and campaigns
  {
    id: "M-070",
    name: "Questline",
    tiers: tiers(
      [
        ["I", "common", 25],
        ["II", "uncommon", 100],
        ["III", "rare", 500],
      ],
      (c) => ledgerItems(c, (e) => e.rule === "quest.complete" && e.meta?.pool === "daily"),
    ),
    prerequisites: [],
    provenance: ["ledger:quest.complete"],
    available: true,
  },
  {
    id: "M-071",
    name: "Dedicated",
    tiers: single("rare", (c) =>
      countProgress(
        ledgerItems(c, (e) => e.id.startsWith("quest|dedication|")),
        4,
      ),
    ),
    prerequisites: [],
    provenance: ["ledger:quest.complete (dedication)"],
    available: true,
  },
  {
    id: "M-072",
    name: "Campaign Complete",
    tiers: single("legendary", (c) =>
      countProgress(
        ledgerItems(c, (e) => e.rule === "campaign.complete"),
        10,
      ),
    ),
    prerequisites: [],
    provenance: ["ledger:campaign.complete"],
    available: true,
  },
  // 2.9 Equipment
  {
    id: "M-080",
    name: "Full Build",
    prerequisites: [],
    provenance: ["ledger:equipment.tier", "config:build (choice of verified items)"],
    available: true,
    tiers: single("rare", (c) => {
      const n = c.spec.equipment.build.filter(
        (s) =>
          s.itemId && s.state === "verified" && c.ctx.ledger.has(`equipment.tier|${s.itemId}|rare`),
      ).length;
      return {
        current: n,
        target: 5,
        completedOn: n >= 5 ? today(c) : null,
        evidence: c.spec.equipment.build
          .filter((s) => s.itemId)
          .map((s) => `equipment.tier|${s.itemId}|rare`),
      };
    }),
  },
  {
    id: "M-081",
    name: "Container Kit",
    prerequisites: [],
    provenance: ["ledger:equipment.tier"],
    available: true,
    tiers: single("uncommon", (c) => {
      const kit = ["docker", "compose", "nginx"].map((i) => verifiedItem(c, i));
      const day = kit.every(Boolean)
        ? (kit
            .map((e) => e?.effectiveDay ?? "")
            .sort()
            .at(-1) ?? null)
        : null;
      return {
        current: kit.filter(Boolean).length,
        target: 3,
        completedOn: day,
        evidence: kit.filter((e): e is LedgerEntry => e !== undefined).map((e) => e.id),
      };
    }),
  },
  {
    id: "M-082",
    name: "Quality Gate",
    prerequisites: [],
    provenance: ["ledger:equipment.tier"],
    available: true,
    tiers: single("uncommon", (c) => {
      const tomes = ["vitest", "jest", "phpunit", "pytest", "eslint", "prettier"]
        .map((i) => verifiedItem(c, i))
        .filter((e): e is LedgerEntry => e !== undefined)
        .sort((a, b) => ((a.effectiveDay ?? "") < (b.effectiveDay ?? "") ? -1 : 1));
      const actions = verifiedItem(c, "github-actions");
      const day =
        tomes.length >= 2 && actions
          ? ([tomes[1]?.effectiveDay ?? "", actions.effectiveDay ?? ""].sort().at(-1) ?? null)
          : null;
      return {
        current: Math.min(2, tomes.length) + (actions ? 1 : 0),
        target: 3,
        completedOn: day,
        evidence: [...tomes.slice(0, 2).map((e) => e.id), ...(actions ? [actions.id] : [])],
      };
    }),
  },
  {
    id: "M-083",
    name: "Green Pipeline",
    tiers: single("uncommon", (c) =>
      countProgress(
        c.facts.runs.map((r) => ({ day: r.day, id: r.key })),
        30,
      ),
    ),
    prerequisites: [],
    provenance: ["events:workflow_run"],
    available: true,
  },
  // 2.10 World map
  {
    id: "M-090",
    name: "Explorer",
    tiers: single("uncommon", () => countProgress([], 1)),
    prerequisites: [],
    provenance: [],
    ...unavailable("The world map is not implemented"),
  },
  {
    id: "M-091",
    name: "Pathfinder",
    tiers: single("epic", () => countProgress([], 1)),
    prerequisites: [],
    provenance: [],
    ...unavailable("The world map is not implemented"),
  },
  {
    id: "M-092",
    name: "Cartographer",
    tiers: single("legendary", () => countProgress([], 1)),
    prerequisites: [],
    provenance: [],
    ...unavailable("The world map is not implemented"),
  },
  // 2.11 Hidden medals
  {
    id: "M-100",
    name: "Phoenix",
    hidden: { hint: "Every legend returns." },
    prerequisites: [],
    provenance: ["ledger:star.victory", "ledger:exp (battle scores)"],
    available: true,
    tiers: single("uncommon", (c) => {
      const days = [...c.facts.battles.keys()].sort();
      for (let i = 1; i < days.length; i++) {
        const day = days[i] as string;
        if (c.facts.battles.get(day)?.victory && daysBetween(days[i - 1] as string, day) > 30)
          return { current: 1, target: 1, completedOn: day, evidence: [`star.victory|${day}`] };
      }
      return { current: 0, target: 1, completedOn: null, evidence: [] };
    }),
  },
  {
    id: "M-101",
    name: "Comeback Season",
    hidden: { hint: "Higher than before." },
    prerequisites: [],
    provenance: ["ledger:season.close"],
    available: true,
    tiers: single("rare", (c) => {
      const closed = closedSeasons(c);
      for (let i = 1; i < closed.length; i++) {
        const before = tierIndex(c, String(closed[i - 1]?.meta?.peakTier));
        const after = tierIndex(c, String(closed[i]?.meta?.peakTier));
        if (before < tierIndex(c, "knight") && after > before)
          return {
            current: 1,
            target: 1,
            completedOn: closed[i]?.effectiveDay ?? null,
            evidence: [closed[i - 1]?.id ?? "", closed[i]?.id ?? ""],
          };
      }
      return { current: 0, target: 1, completedOn: null, evidence: [] };
    }),
  },
  {
    id: "M-102",
    name: "Weekend Warrior",
    hidden: { hint: "Saturdays are for shipping." },
    tiers: single("uncommon", (c) =>
      countProgress(
        victories(c).filter((v) => [0, 6].includes(new Date(`${v.day}T00:00:00Z`).getUTCDay())),
        10,
      ),
    ),
    prerequisites: [],
    provenance: ["ledger:star.victory"],
    available: true,
  },
  {
    id: "M-103",
    name: "Clutch",
    hidden: { hint: "Just in time." },
    prerequisites: [],
    provenance: ["ledger:objective", "ledger:star"],
    available: true,
    tiers: single("rare", (c) =>
      first(
        c.seasons.flatMap((s) =>
          Object.entries(s.trialMet)
            .filter(([, day]) => day && day >= addDays(s.season.endDay, -6))
            .map(([tier, day]) => ({ day: day as string, id: `${s.season.id}:trial:${tier}` })),
        ),
      ),
    ),
  },
  {
    id: "M-104",
    name: "Polymath",
    hidden: { hint: "Six schools, one mind." },
    tiers: single("epic", (c) => coverRoles(c, "mastery.tier", "adept")),
    prerequisites: [],
    provenance: ["ledger:mastery.tier"],
    available: true,
  },
];

export interface MedalView {
  id: string;
  name: string;
  tier: string;
  rarity: Rarity;
  earned: boolean;
  earnedOn: string | null;
  recordedAt: string | null;
  hidden: boolean;
  hint: string | null;
  progress: Progress;
  provenance: string[];
  available: boolean;
}

/** Awards newly earned medal tiers (with BP) and returns the medal book. */
export function runMedals(c: MedalContext): MedalView[] {
  const { ctx } = c;
  const views: MedalView[] = [];
  const earnedAny = (id: string) =>
    ctx.ledger.entries.some((e) => e.kind === "medal" && e.meta?.medal === id);
  for (const def of MEDALS) {
    const tierList: Array<TierDef & { season?: SeasonState }> = def.perSeason
      ? c.seasons.map((s) => ({
          tier: s.season.id,
          rarity: def.perSeasonRarity ?? "uncommon",
          evaluate: (mc: MedalContext) => def.perSeason?.(mc, s) ?? countProgress([], 1),
          season: s,
        }))
      : def.tiers;
    let previousEarned = true;
    for (const tier of tierList) {
      const id = `medal|${def.id}|${tier.tier}`;
      const progress = def.available ? tier.evaluate(c) : countProgress([], 1);
      const prerequisitesMet =
        def.prerequisites.every(earnedAny) && (def.perSeason ? true : previousEarned);
      if (def.available && prerequisitesMet && !ctx.ledger.has(id) && progress.completedOn) {
        const reward = RARITY_REWARDS[tier.rarity];
        const season = seasonOf(progress.completedOn, ctx.config.season1Start);
        const meta = {
          medal: def.id,
          tier: tier.tier,
          rarity: tier.rarity,
          evidence: progress.evidence.slice(0, 5).join(","),
          provenance: def.provenance.join(";"),
        };
        ctx.ledger.add({
          id,
          kind: "medal",
          rule: "medal.earned",
          ruleVersion: ctx.rules.version,
          subject: [`medal:${def.id}:${tier.tier}`],
          amount: 0,
          effectiveDay: progress.completedOn,
          createdAt: ctx.runAt,
          ...(season ? { season: season.id } : {}),
          meta,
        });
        ctx.ledger.add({
          id: `bp.medal|${def.id}|${tier.tier}`,
          kind: "bp",
          rule: "bp.medal",
          ruleVersion: ctx.rules.version,
          subject: [`medal:${def.id}:${tier.tier}`],
          amount: reward.bp,
          effectiveDay: progress.completedOn,
          createdAt: ctx.runAt,
          ...(season ? { season: season.id } : {}),
          meta: {
            medal: def.id,
            tier: tier.tier,
            ...(reward.cosmetic ? { cosmetic: reward.cosmetic } : {}),
          },
        });
      }
      const entry = ctx.ledger.get(id);
      previousEarned = entry !== undefined;
      if (def.perSeason && !entry && !(tier.season?.closed === false)) continue;
      views.push({
        id: def.id,
        // Hidden medals show as "???" with their hint until earned (GDD §G.2).
        name: def.hidden && !entry ? "???" : def.name,
        tier: tier.tier,
        rarity: tier.rarity,
        earned: entry !== undefined,
        earnedOn: entry?.effectiveDay ?? null,
        recordedAt: entry?.createdAt ?? null,
        hidden: def.hidden !== undefined && entry === undefined,
        hint: def.hidden?.hint ?? null,
        progress,
        provenance: def.provenance,
        available: def.available,
      });
    }
  }
  return views;
}
