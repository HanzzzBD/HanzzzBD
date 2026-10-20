/**
 * Quest catalog v1 (docs/game-design/quest-catalog.md). Quests reward BP only (STK-5).
 * Every progress evaluator reads the facts index (verified, qualified activity with
 * effective days inside the period). Nothing here reads configuration as evidence.
 */
import type { Facts } from "../facts.ts";
import { within } from "../facts.ts";
import type { EmblemId } from "../heroes/emblems.ts";
import type { SpecializationResult } from "../heroes/index.ts";
import type { LedgerIndex } from "../ledger.ts";
import type { SeasonState } from "../progression.ts";
import { addDays, isoWeek } from "../time.ts";

export type QuestPool = "daily" | "weekly" | "specialty" | "contract";

export interface PeriodWindow {
  /** "2026-10-20" (day), "2026-W43" (week) or "S1" (season). */
  id: string;
  start: string;
  end: string;
}

export interface EligibilityContext {
  facts: Facts;
  spec: SpecializationResult;
  /** First day of the period: eligibility only looks at days before it. */
  before: string;
  ledger: LedgerIndex;
}

export interface ProgressContext {
  facts: Facts;
  spec: SpecializationResult;
  window: PeriodWindow;
  ledger: LedgerIndex;
  season?: SeasonState;
}

export interface Progress {
  current: number;
  target: number;
  /** Day the completion condition was met, or null. */
  completedOn: string | null;
  /** Ledger or event keys proving the progress (first `target` items). */
  evidence: string[];
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  pool: QuestPool;
  /** Daily board slots this quest may fill. */
  slots?: readonly (1 | 2 | 3)[];
  reward: { bp: number; cosmetic?: string };
  repeatable: "per_day" | "per_week" | "per_season";
  emblem?: EmblemId;
  collaborative?: boolean;
  /** Unavailable quests never enter a board (their data or system is not implemented). */
  available: boolean;
  unavailableReason?: string;
  eligibilityRule: string;
  verification: string;
  eligible(ctx: EligibilityContext): boolean;
  progress(ctx: ProgressContext): Progress;
  /** Only decidable once the period is over (e.g. "no Skirmish days"). */
  evaluateAtClose?: boolean;
}

// ---------------------------------------------------------------- evaluation helpers

type Item = { day: string; id: string };
const byDayThenId = (a: Item, b: Item) =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Completion when `target` items exist; completedOn is the day of the target-th item. */
export function countProgress(items: readonly Item[], target: number): Progress {
  const sorted = [...items].sort(byDayThenId);
  const hit = sorted[target - 1];
  return {
    current: sorted.length,
    target,
    completedOn: hit ? hit.day : null,
    evidence: sorted.slice(0, target).map((i) => i.id),
  };
}

/** Completion when `target` distinct values of `group` exist. */
export function distinctProgress(
  items: ReadonlyArray<Item & { group: string }>,
  target: number,
): Progress {
  const sorted = [...items].sort(byDayThenId);
  const seen = new Map<string, string>();
  let completedOn: string | null = null;
  for (const item of sorted) {
    if (!seen.has(item.group)) seen.set(item.group, item.id);
    if (completedOn === null && seen.size >= target) completedOn = item.day;
  }
  return { current: seen.size, target, completedOn, evidence: [...seen.values()].slice(0, target) };
}

const lookback = (ctx: EligibilityContext, days: number) => ({
  from: addDays(ctx.before, -days),
  to: addDays(ctx.before, -1),
});
const recent = <T extends { day: string }>(
  list: readonly T[],
  ctx: EligibilityContext,
  days: number,
) => {
  const w = lookback(ctx, days);
  return within(list, w.from, w.to);
};
const inWindow = <T extends { day: string }>(list: readonly T[], ctx: ProgressContext) =>
  within(list, ctx.window.start, ctx.window.end);
const unlockedBefore = (ctx: EligibilityContext, prefix: string) =>
  ctx.facts.unlocks.filter((u) => u.id.startsWith(prefix) && (u.effectiveDay ?? "") < ctx.before);
const mainHero = (spec: SpecializationResult) =>
  spec.heroes.find((h) => h.isMain && h.state === "unlocked") ?? null;
const contested = (f: Facts) => f.objectives.filter((o) => o.contested && o.counted);
const victoryItems = (f: Facts) =>
  [...f.battles.values()]
    .filter((b) => b.victory)
    .map((b) => ({ day: b.day, id: b.victoryId ?? b.day }));
const battleItems = (f: Facts) =>
  [...f.battles.values()].map((b) => ({ day: b.day, id: `battle|${b.day}` }));
const always = () => true;
const unavailable = (reason: string) => ({
  available: false,
  unavailableReason: reason,
  eligible: () => false,
  progress: (): Progress => ({ current: 0, target: 1, completedOn: null, evidence: [] }),
});

// ---------------------------------------------------------------- daily quests (§1)

const DAILY: QuestDef[] = [
  {
    id: "D01",
    name: "First Blood",
    description: "Make 1 qualifying commit.",
    pool: "daily",
    slots: [1, 3],
    reward: { bp: 10 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "Always",
    verification: "Commit keys",
    eligible: always,
    progress: (c) => countProgress(inWindow(c.facts.commits, c), 1),
  },
  {
    id: "D02",
    name: "Victory Lap",
    description: "Win today's battle (score ≥ 30).",
    pool: "daily",
    slots: [1, 3],
    reward: { bp: 15 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "Always",
    verification: "Battle entry for the day",
    eligible: always,
    progress: (c) => countProgress(inWindow(victoryItems(c.facts), c), 1),
  },
  {
    id: "D03",
    name: "Triple Strike",
    description: "Make ≥ 3 qualifying commits.",
    pool: "daily",
    slots: [3],
    reward: { bp: 15 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "A day with ≥ 3 qualifying commits in the last 30 days",
    verification: "Commit keys",
    eligible: (c) =>
      [...c.facts.byDay(recent(c.facts.commits, c, 30)).values()].some((list) => list.length >= 3),
    progress: (c) => countProgress(inWindow(c.facts.commits, c), 3),
  },
  {
    id: "D04",
    name: "Two Fronts",
    description: "Make qualifying commits in 2 different repos.",
    pool: "daily",
    slots: [2, 3],
    reward: { bp: 15 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "≥ 2 repos with qualifying commits in the last 30 days",
    verification: "Commit keys, distinct repos",
    eligible: (c) => new Set(recent(c.facts.commits, c, 30).map((x) => x.repo)).size >= 2,
    progress: (c) =>
      distinctProgress(
        inWindow(c.facts.commits, c).map((x) => ({ ...x, group: x.repo })),
        2,
      ),
  },
  {
    id: "D05",
    name: "Second Opinion",
    description: "Give 1 peer review.",
    pool: "daily",
    slots: [2],
    reward: { bp: 20 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "A peer review in the last 90 days",
    verification: "Review IDs, human author",
    eligible: (c) => recent(c.facts.reviews, c, 90).length > 0,
    progress: (c) => countProgress(inWindow(c.facts.reviews, c), 1),
  },
  {
    id: "D06",
    name: "Objective Secured",
    description: "Get 1 qualifying PR merged.",
    pool: "daily",
    slots: [2],
    reward: { bp: 20 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "A merged PR in the last 90 days",
    verification: "PR node IDs",
    eligible: (c) => recent(c.facts.prs, c, 90).length > 0,
    progress: (c) => countProgress(inWindow(c.facts.prs, c), 1),
  },
  {
    id: "D07",
    name: "Triage",
    description: "Open or resolve 1 issue.",
    pool: "daily",
    slots: [2, 3],
    reward: { bp: 10 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "Issue activity in the last 90 days",
    verification: "Issue node IDs",
    eligible: (c) => recent([...c.facts.issuesOpened, ...c.facts.issuesResolved], c, 90).length > 0,
    progress: (c) =>
      countProgress(inWindow([...c.facts.issuesOpened, ...c.facts.issuesResolved], c), 1),
  },
  {
    id: "D08",
    name: "Hero Training",
    description: "Commit to a repo where your main hero's technology share is ≥ 10%.",
    pool: "daily",
    slots: [3],
    reward: { bp: 15 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "Main hero set and unlocked",
    verification: "Commit keys + language snapshot",
    eligible: (c) => mainHero(c.spec) !== null,
    progress: (c) => {
      const main = mainHero(c.spec);
      return countProgress(
        inWindow(c.facts.commits, c).filter(
          (x) => main !== null && (c.facts.heroesByRepo.get(x.repo)?.has(main.id) ?? false),
        ),
        1,
      );
    },
  },
  {
    id: "D09",
    name: "Green Lane",
    description: "Get 1 successful push-triggered workflow run in an owned repo.",
    pool: "daily",
    slots: [2, 3],
    reward: { bp: 15 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "Owns the verified GitHub Actions item",
    verification: "Run IDs, event = push, triggered by the player",
    eligible: (c) => unlockedBefore(c, "equipment.tier|github-actions|").length > 0,
    progress: (c) =>
      countProgress(
        inWindow(c.facts.runs, c).map((r) => ({ day: r.day, id: r.key })),
        1,
      ),
  },
  {
    id: "D10",
    name: "Contested Ground",
    description: "Complete 1 contested objective.",
    pool: "daily",
    slots: [2],
    reward: { bp: 25 },
    repeatable: "per_day",
    available: true,
    eligibilityRule: "A contested objective in the last 90 days",
    verification: "Objective evidence",
    eligible: (c) => recent(contested(c.facts), c, 90).length > 0,
    progress: (c) => countProgress(inWindow(contested(c.facts), c), 1),
  },
  {
    id: "D11",
    name: "Quality Pass",
    description: "Merge a PR whose head commit passed all checks.",
    pool: "daily",
    slots: [2],
    reward: { bp: 20 },
    repeatable: "per_day",
    eligibilityRule: "Owns a Tome item and the Actions item",
    verification: "PR + check-suite conclusion",
    ...unavailable("Check-suite results are not collected"),
  },
  {
    id: "C01",
    name: "Ally Assist",
    description: "Review a PR authored by a verified ally.",
    pool: "daily",
    slots: [2],
    reward: { bp: 25 },
    repeatable: "per_day",
    collaborative: true,
    eligibilityRule: "≥ 1 verified ally",
    verification: "Review ID + ally match",
    ...unavailable("The squad system is not implemented"),
  },
  {
    id: "C02",
    name: "Co-Op Commit",
    description: "Make 1 qualifying commit co-authored with a human GitHub user.",
    pool: "daily",
    slots: [2],
    reward: { bp: 20 },
    repeatable: "per_day",
    collaborative: true,
    available: true,
    eligibilityRule: "A co-authored commit in the last 90 days",
    verification: "Commit trailer matched to a GitHub user",
    eligible: (c) => recent(c.facts.commits, c, 90).some((x) => x.coAuthored),
    progress: (c) =>
      countProgress(
        inWindow(c.facts.commits, c).filter((x) => x.coAuthored),
        1,
      ),
  },
];

// ---------------------------------------------------------------- weekly quests (§2, §4)

const heroesInRepos = (c: ProgressContext, onlyUnlocked: boolean) =>
  inWindow(c.facts.commits, c).flatMap((x) =>
    [...(c.facts.heroesByRepo.get(x.repo) ?? [])]
      .filter(
        (h) => !onlyUnlocked || c.spec.heroes.some((s) => s.id === h && s.state === "unlocked"),
      )
      .map((h) => ({ day: x.day, id: x.id, group: h })),
  );

const WEEKLY: QuestDef[] = [
  {
    id: "W01",
    name: "Steady Hands",
    description: "Win 4 battles (Victory or MVP).",
    pool: "weekly",
    reward: { bp: 100 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "Always",
    verification: "Battle entries",
    eligible: always,
    progress: (c) => countProgress(inWindow(victoryItems(c.facts), c), 4),
  },
  {
    id: "W02",
    name: "Marathon",
    description: "Be active on 5 days.",
    pool: "weekly",
    reward: { bp: 100 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "≥ 3 active days in some week of the last 4 weeks",
    verification: "Battle entries (any result)",
    eligible: (c) => {
      const weeks = new Map<string, number>();
      for (const b of recent(battleItems(c.facts), c, 28))
        weeks.set(isoWeek(b.day), (weeks.get(isoWeek(b.day)) ?? 0) + 1);
      return [...weeks.values()].some((n) => n >= 3);
    },
    progress: (c) => countProgress(inWindow(battleItems(c.facts), c), 5),
  },
  {
    id: "W03",
    name: "Siege",
    description: "Get 3 qualifying PRs merged.",
    pool: "weekly",
    reward: { bp: 120 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "≥ 3 merged PRs in the last 90 days",
    verification: "PR node IDs",
    eligible: (c) => recent(c.facts.prs, c, 90).length >= 3,
    progress: (c) => countProgress(inWindow(c.facts.prs, c), 3),
  },
  {
    id: "W04",
    name: "Bug Hunter",
    description: "Resolve 2 issues.",
    pool: "weekly",
    reward: { bp: 80 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "An issue resolved in the last 90 days",
    verification: "Issue node IDs, state reason completed",
    eligible: (c) => recent(c.facts.issuesResolved, c, 90).length > 0,
    progress: (c) => countProgress(inWindow(c.facts.issuesResolved, c), 2),
  },
  {
    id: "W05",
    name: "Dual Wield",
    description: "Commit in repos of 2 different unlocked heroes (share ≥ 10%).",
    pool: "weekly",
    reward: { bp: 80 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "≥ 2 heroes unlocked",
    verification: "Commit keys + snapshots",
    eligible: (c) => unlockedBefore(c, "unlock.hero|").length >= 2,
    progress: (c) => distinctProgress(heroesInRepos(c, true), 2),
  },
  {
    id: "W06",
    name: "Ship Day",
    description: "Publish 1 qualifying release.",
    pool: "weekly",
    reward: { bp: 150 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "A release in the last 180 days",
    verification: "Release ID + qualifying rule",
    eligible: (c) => recent(c.facts.releases, c, 180).length > 0,
    progress: (c) => countProgress(inWindow(c.facts.releases, c), 1),
  },
  {
    id: "W07",
    name: "Peer Review",
    description: "Give 3 peer reviews.",
    pool: "weekly",
    reward: { bp: 120 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "A peer review in the last 90 days",
    verification: "Review IDs",
    eligible: (c) => recent(c.facts.reviews, c, 90).length > 0,
    progress: (c) => countProgress(inWindow(c.facts.reviews, c), 3),
  },
  {
    id: "W08",
    name: "MVP Performance",
    description: "Win 1 MVP battle.",
    pool: "weekly",
    reward: { bp: 120 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "A contested objective in the last 90 days",
    verification: "Battle entry",
    eligible: (c) => recent(contested(c.facts), c, 90).length > 0,
    progress: (c) =>
      countProgress(
        inWindow(
          [...c.facts.battles.values()]
            .filter((b) => b.mvp)
            .map((b) => ({ day: b.day, id: b.mvpId ?? b.day })),
          c,
        ),
        1,
      ),
  },
  {
    id: "W09",
    name: "Explorer",
    description: "Commit to a repo you had not committed to in the previous 30 days.",
    pool: "weekly",
    reward: { bp: 80 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "≥ 2 eligible repos (≥ 5 qualifying commits each)",
    verification: "Commit keys + repo history",
    eligible: (c) => {
      const perRepo = new Map<string, number>();
      for (const x of c.facts.commits)
        if (x.day < c.before) perRepo.set(x.repo, (perRepo.get(x.repo) ?? 0) + 1);
      return [...perRepo.values()].filter((n) => n >= 5).length >= 2;
    },
    progress: (c) => {
      // Previous active day per repo, from a sorted index (linear in the number of commits).
      const daysByRepo = new Map<string, string[]>();
      for (const x of c.facts.commits)
        daysByRepo.set(x.repo, [...(daysByRepo.get(x.repo) ?? []), x.day]);
      for (const [repo, days] of daysByRepo) daysByRepo.set(repo, [...new Set(days)].sort());
      const fresh = inWindow(c.facts.commits, c).filter((x) => {
        const days = daysByRepo.get(x.repo) ?? [];
        const previous = days.filter((d) => d < x.day).at(-1);
        return previous === undefined || previous < addDays(x.day, -30);
      });
      return countProgress(fresh, 1);
    },
  },
  {
    id: "W10",
    name: "Tidy Week",
    description: "No Skirmish days: every active day a Victory (at least 3 active days).",
    pool: "weekly",
    reward: { bp: 100 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "Always",
    verification: "Battle entries",
    eligible: always,
    evaluateAtClose: true,
    progress: (c) => {
      const days = inWindow(
        [...c.facts.battles.values()].map((b) => ({ ...b, id: `battle|${b.day}` })),
        c,
      );
      const clean = days.length >= 3 && days.every((b) => b.victory);
      const last = [...days].sort(byDayThenId).at(-1);
      return {
        current: days.filter((b) => b.victory).length,
        target: Math.max(3, days.length),
        completedOn: clean && last ? last.day : null,
        evidence: days.map((b) => b.id).sort(),
      };
    },
  },
  {
    id: "C03",
    name: "Squad Up",
    description: "Interact with 2 different verified allies.",
    pool: "weekly",
    reward: { bp: 100 },
    repeatable: "per_week",
    collaborative: true,
    eligibilityRule: "≥ 2 verified allies",
    verification: "Synergy events",
    ...unavailable("The squad system is not implemented"),
  },
  {
    id: "C04",
    name: "Reviewed and Merged",
    description: "Get 1 PR merged after an approving review from another human.",
    pool: "weekly",
    reward: { bp: 150 },
    repeatable: "per_week",
    collaborative: true,
    available: true,
    eligibilityRule: "A contested objective in the last 90 days",
    verification: "PR + review",
    eligible: (c) => recent(contested(c.facts), c, 90).length > 0,
    progress: (c) =>
      countProgress(
        inWindow(
          c.facts.objectives.filter((o) => o.type === "reviewed_merge" && o.counted),
          c,
        ),
        1,
      ),
  },
  {
    id: "C05",
    name: "Good Neighbour",
    description: "Get 1 PR merged into a repo you do not own.",
    pool: "weekly",
    reward: { bp: 150 },
    repeatable: "per_week",
    collaborative: true,
    available: true,
    eligibilityRule: "An external PR in the last 180 days",
    verification: "PR + repo ownership",
    eligible: (c) => recent(c.facts.prs, c, 180).some((p) => p.external),
    progress: (c) =>
      countProgress(
        inWindow(c.facts.prs, c).filter((p) => p.external),
        1,
      ),
  },
  {
    id: "C06",
    name: "Community Fix",
    description: "Resolve an issue opened by another human.",
    pool: "weekly",
    reward: { bp: 120 },
    repeatable: "per_week",
    collaborative: true,
    available: true,
    eligibilityRule: "A community fix in the last 90 days",
    verification: "Issue author + closer",
    eligible: (c) =>
      recent(
        c.facts.objectives.filter((o) => o.type === "community_fix"),
        c,
        90,
      ).length > 0,
    progress: (c) =>
      countProgress(
        inWindow(
          c.facts.objectives.filter((o) => o.type === "community_fix" && o.counted),
          c,
        ),
        1,
      ),
  },
];

// ---------------------------------------------------------------- emblem specialty quests (§5)

const domainCommits = (
  c: ProgressContext,
  domain: "fe" | "be" | "ai" | "ops" | "db",
  minPercent: number,
) => inWindow(c.facts.commits, c).filter((x) => c.facts.domainShare(x.repo, domain) >= minPercent);

const SPECIALTY: QuestDef[] = [
  ...(["frontend", "backend"] as const).map(
    (emblem): QuestDef => ({
      id: emblem === "frontend" ? "E-FE" : "E-BE",
      name: emblem === "frontend" ? "Frontend Drills" : "Backend Drills",
      description: `Qualifying commits in ${emblem === "frontend" ? "FE" : "BE"}-weighted repos (≥ 0.5) on 3 different days.`,
      pool: "specialty",
      emblem,
      reward: { bp: 100 },
      repeatable: "per_week",
      available: true,
      eligibilityRule: "This emblem is active at the start of the week",
      verification: "Commit keys + snapshots",
      eligible: always,
      progress: (c) =>
        distinctProgress(
          domainCommits(c, emblem === "frontend" ? "fe" : "be", 50).map((x) => ({
            ...x,
            group: x.day,
          })),
          3,
        ),
    }),
  ),
  {
    id: "E-FS",
    name: "Both Ends",
    description: "Qualifying commits in an FE-dominant and a BE-dominant repo in the same week.",
    pool: "specialty",
    emblem: "fullstack",
    reward: { bp: 100 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "This emblem is active at the start of the week",
    verification: "Commit keys + snapshots",
    eligible: always,
    progress: (c) =>
      distinctProgress(
        [
          ...domainCommits(c, "fe", 50).map((x) => ({ ...x, group: "fe" })),
          ...domainCommits(c, "be", 50).map((x) => ({ ...x, group: "be" })),
        ],
        2,
      ),
  },
  {
    id: "E-AI",
    name: "Pattern Hunt",
    description: "3 qualifying commits in AI-weighted repos (≥ 0.5).",
    pool: "specialty",
    emblem: "ai_ml",
    reward: { bp: 100 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "This emblem is active at the start of the week",
    verification: "Commit keys + snapshots",
    eligible: always,
    progress: (c) => countProgress(domainCommits(c, "ai", 50), 3),
  },
  {
    id: "E-OP",
    name: "Pipeline Watch",
    description: "3 days with a successful push-triggered workflow run.",
    pool: "specialty",
    emblem: "devops",
    reward: { bp: 100 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "This emblem is active at the start of the week",
    verification: "Run IDs",
    eligible: always,
    progress: (c) =>
      distinctProgress(
        inWindow(c.facts.runs, c).map((r) => ({ day: r.day, id: r.key, group: r.day })),
        3,
      ),
  },
  {
    id: "E-DB",
    name: "Schema Keeper",
    description:
      "2 qualifying commits in DB-weighted repos (≥ 0.2) or repos with migration markers.",
    pool: "specialty",
    emblem: "database",
    reward: { bp: 100 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "This emblem is active at the start of the week",
    verification: "Commit keys + snapshots or markers",
    eligible: always,
    progress: (c) =>
      countProgress(
        inWindow(c.facts.commits, c).filter(
          (x) => c.facts.domainShare(x.repo, "db") >= 20 || c.facts.migrationRepos.has(x.repo),
        ),
        2,
      ),
  },
  {
    id: "E-OS",
    name: "Open Hands",
    description: "1 external merge or 2 peer reviews in repos you do not own.",
    pool: "specialty",
    emblem: "open_source",
    reward: { bp: 150 },
    repeatable: "per_week",
    available: true,
    eligibilityRule: "This emblem is active at the start of the week",
    verification: "PR + review + repo ownership",
    eligible: always,
    progress: (c) => {
      const merges = countProgress(
        inWindow(c.facts.prs, c).filter((p) => p.external),
        1,
      );
      const reviews = countProgress(
        inWindow(c.facts.reviews, c).filter((r) => r.external),
        2,
      );
      const done = [merges, reviews]
        .filter((p) => p.completedOn !== null)
        .sort((a, b) => ((a.completedOn ?? "") < (b.completedOn ?? "") ? -1 : 1))[0];
      return (
        done ?? {
          current: Math.max(merges.current, reviews.current),
          target: 1,
          completedOn: null,
          evidence: [],
        }
      );
    },
  },
];

// ---------------------------------------------------------------- season contracts (§3)

const seasonQuestCompletions = (c: ProgressContext, pool: QuestPool) =>
  c.ledger.entries
    .filter(
      (e) =>
        e.kind === "quest" &&
        e.rule === "quest.complete" &&
        e.meta?.pool === pool &&
        (e.effectiveDay ?? "") >= c.window.start &&
        (e.effectiveDay ?? "") <= c.window.end,
    )
    .map((e) => ({ day: e.effectiveDay ?? "", id: e.id }));

const CONTRACTS: QuestDef[] = [
  {
    id: "S01",
    name: "Season Regular",
    description: "Complete 40 daily quests this season.",
    pool: "contract",
    reward: { bp: 300, cosmetic: "badge-style:regular" },
    repeatable: "per_season",
    available: true,
    eligibilityRule: "Offered by the season draw",
    verification: "Daily quest completions",
    eligible: always,
    progress: (c) => countProgress(seasonQuestCompletions(c, "daily"), 40),
  },
  {
    id: "S02",
    name: "Weekly Warrior",
    description: "Complete 15 weekly quests this season.",
    pool: "contract",
    reward: { bp: 350, cosmetic: "badge-style:weekly-warrior" },
    repeatable: "per_season",
    available: true,
    eligibilityRule: "Offered by the season draw",
    verification: "Weekly quest completions",
    eligible: always,
    progress: (c) => countProgress(seasonQuestCompletions(c, "weekly"), 15),
  },
  {
    id: "S03",
    name: "Campaigner",
    description: "Reach Warden this season.",
    pool: "contract",
    reward: { bp: 200 },
    repeatable: "per_season",
    available: true,
    eligibilityRule: "Offered by the season draw",
    verification: "Season rank timeline",
    eligible: always,
    progress: (c) => {
      const day = c.season?.reached.warden ?? null;
      return {
        current: day ? 1 : 0,
        target: 1,
        completedOn: day,
        evidence: day ? [`rank:warden:${day}`] : [],
      };
    },
  },
  {
    id: "S04",
    name: "Bridge Builder",
    description: "Complete 6 contested objectives this season.",
    pool: "contract",
    reward: { bp: 400, cosmetic: "frame-tint:bridge" },
    repeatable: "per_season",
    available: true,
    eligibilityRule: "Offered by the season draw",
    verification: "Objective entries",
    eligible: always,
    progress: (c) => countProgress(inWindow(contested(c.facts), c), 6),
  },
  {
    id: "S05",
    name: "Well-Rounded",
    description: "Battle with commits in repos of 3 different heroes on 10 days.",
    pool: "contract",
    reward: { bp: 250 },
    repeatable: "per_season",
    available: true,
    eligibilityRule: "Offered by the season draw",
    verification: "Commit keys + snapshots",
    eligible: always,
    progress: (c) => {
      const days: Item[] = [];
      for (const [day, list] of c.facts.byDay(inWindow(c.facts.commits, c))) {
        const heroes = new Set(list.flatMap((x) => [...(c.facts.heroesByRepo.get(x.repo) ?? [])]));
        if (heroes.size >= 3 && c.facts.battles.has(day)) days.push({ day, id: `battle|${day}` });
      }
      return countProgress(days, 10);
    },
  },
  {
    id: "S06",
    name: "Ten Victories Clean",
    description: "Fill the 5-star weekly cap in 10 weeks this season.",
    pool: "contract",
    reward: { bp: 400, cosmetic: "title:relentless" },
    repeatable: "per_season",
    available: true,
    eligibilityRule: "Offered by the season draw",
    verification: "Star entries",
    eligible: always,
    progress: (c) => {
      const weeks = new Map<string, { stars: number; day: string }>();
      for (const s of inWindow(
        c.facts.stars.map((e) => ({ ...e, day: e.effectiveDay ?? "" })),
        c,
      )) {
        const w = weeks.get(s.week ?? "") ?? { stars: 0, day: "" };
        w.stars += s.amount;
        if (s.day > w.day) w.day = s.day;
        weeks.set(s.week ?? "", w);
      }
      return countProgress(
        [...weeks.entries()]
          .filter(([, w]) => w.stars >= 5)
          .map(([week, w]) => ({ day: w.day, id: `week|${week}` })),
        10,
      );
    },
  },
];

export const QUESTS: readonly QuestDef[] = [...DAILY, ...WEEKLY, ...SPECIALTY, ...CONTRACTS];

export const DEDICATION = {
  id: "dedication",
  name: "Dedication",
  bp: 50,
  fullDays: 5,
  dailies: 3,
} as const;
export const DAILY_BOARD_SLOTS = 3;
export const WEEKLY_BOARD_SLOTS = 3;
export const CONTRACTS_PER_SEASON = 2;
export const WEEKLY_MIN_LEVEL = 3;

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}
