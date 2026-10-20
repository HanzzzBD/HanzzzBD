/**
 * Milestone campaigns (quest-catalog §6): one-time, never expire. Steps finish in order;
 * progress made before a step became active still counts if it is verifiable (GDD §F.5).
 * Steps pay nothing; completing the whole campaign pays its milestone BP (STK-7, STK-11).
 */
import type { ExpContext } from "../exp.ts";
import type { Facts } from "../facts.ts";
import { MASTERY_TIERS } from "../heroes/catalog.ts";
import type { SpecializationResult } from "../heroes/index.ts";
import { cumulativeExpForLevel } from "../level.ts";
import type { SeasonState } from "../progression.ts";
import { dayOf, isoWeek, seasonOf } from "../time.ts";
import { countProgress, distinctProgress, type Progress } from "./catalog.ts";

export interface CampaignContext {
  ctx: ExpContext;
  facts: Facts;
  spec: SpecializationResult;
  seasons: readonly SeasonState[];
}

interface StepDef {
  text: string;
  evaluate(c: CampaignContext): Progress;
}

export interface CampaignDef {
  id: string;
  name: string;
  reward: { bp: number; cosmetic?: string };
  steps: StepDef[];
  available: boolean;
  unavailableReason?: string;
}

export interface CampaignView {
  id: string;
  name: string;
  reward: { bp: number; cosmetic?: string };
  available: boolean;
  completed: boolean;
  completedOn: string | null;
  steps: Array<{
    index: number;
    text: string;
    done: boolean;
    doneOn: string | null;
    progress: Progress;
  }>;
}

const done = (day: string | null, evidence: string[]): Progress => ({
  current: day ? 1 : 0,
  target: 1,
  completedOn: day,
  evidence,
});
const ledgerDays = (c: CampaignContext, prefix: string) =>
  c.ctx.ledger.entries
    .filter((e) => e.id.startsWith(prefix))
    .map((e) => ({ day: e.effectiveDay ?? "", id: e.id }));
const firstDay = (items: Array<{ day: string; id: string }>): Progress => countProgress(items, 1);
const victories = (c: CampaignContext) =>
  [...c.facts.battles.values()]
    .filter((b) => b.victory)
    .map((b) => ({ day: b.day, id: b.victoryId ?? b.day }));
const today = (c: CampaignContext) => dayOf(c.ctx.runMs, c.ctx.config.timezone);
const mainHero = (c: CampaignContext) =>
  c.spec.heroes.find((h) => h.isMain && h.state === "unlocked") ?? null;
const reachedAny = (c: CampaignContext, pick: (s: SeasonState) => string | undefined) =>
  firstDay(c.seasons.map((s) => ({ day: pick(s) ?? "", id: s.season.id })).filter((x) => x.day));

export const CAMPAIGNS: readonly CampaignDef[] = [
  {
    id: "K1",
    name: "The First Campaign",
    reward: { bp: 200, cosmetic: "title:campaigner" },
    available: true,
    steps: [
      { text: "Win 3 battles", evaluate: (c) => countProgress(victories(c), 3) },
      {
        text: "Complete 5 daily quests",
        evaluate: (c) => countProgress(ledgerDays(c, "quest|D"), 5),
      },
      {
        text: "Complete 1 weekly quest",
        evaluate: (c) =>
          countProgress(
            c.ctx.ledger.entries
              .filter((e) => e.rule === "quest.complete" && e.meta?.pool === "weekly")
              .map((e) => ({ day: e.effectiveDay ?? "", id: e.id })),
            1,
          ),
      },
      {
        text: "Reach Squire",
        evaluate: (c) => reachedAny(c, (s) => (s.startStars < 9 ? s.reached.squire : undefined)),
      },
    ],
  },
  {
    id: "K2",
    name: "Path of the Hero",
    reward: { bp: 250, cosmetic: "frame:heroic" },
    available: true,
    steps: [
      {
        text: "Set a main hero",
        evaluate: (c) =>
          c.ctx.config.heroes?.main && mainHero(c)?.id === c.ctx.config.heroes.main
            ? done(today(c), [`hero:${c.ctx.config.heroes.main}`])
            : done(null, []),
      },
      {
        text: "Earn 300 MP on the main hero",
        evaluate: (c) => {
          const h = mainHero(c);
          return {
            current: h?.mp ?? 0,
            target: 300,
            completedOn: h && h.mp >= 300 ? today(c) : null,
            evidence: h ? [`hero:${h.id}`] : [],
          };
        },
      },
      {
        text: "Unlock a hero of a different role",
        evaluate: (c) => {
          const main = mainHero(c);
          const role = main?.hero?.role;
          return firstDay(
            c.spec.heroes
              .filter((h) => h.state === "unlocked" && h.hero && h.hero.role !== role)
              .map((h) => ({
                day: h.tierHistory[0]?.reachedOn ?? today(c),
                id: `unlock.hero|${h.id}`,
              })),
          );
        },
      },
      {
        text: "Main hero reaches Adept",
        evaluate: (c) => {
          const h = mainHero(c);
          const adept = h?.tierHistory.find((t) => t.tier === "adept");
          return done(adept?.reachedOn ?? null, h && adept ? [`mastery|${h.id}|adept`] : []);
        },
      },
    ],
  },
  {
    id: "K3",
    name: "Second Opinions",
    reward: { bp: 300, cosmetic: "title:trusted-reviewer" },
    available: true,
    steps: [
      { text: "Give 3 peer reviews", evaluate: (c) => countProgress(c.facts.reviews, 3) },
      {
        text: "Receive an approving review from another human",
        evaluate: (c) =>
          firstDay(c.facts.approvalsReceived.map((a) => ({ day: a.day, id: a.key }))),
      },
      {
        text: "Win 2 MVP battles in one ISO week",
        evaluate: (c) => {
          const weeks = new Map<string, Array<{ day: string; id: string }>>();
          for (const b of c.facts.battles.values())
            if (b.mvp)
              weeks.set(isoWeek(b.day), [
                ...(weeks.get(isoWeek(b.day)) ?? []),
                { day: b.day, id: b.mvpId ?? b.day },
              ]);
          const hits = [...weeks.values()]
            .map((list) => countProgress(list, 2))
            .filter((p) => p.completedOn)
            .sort((a, b) => ((a.completedOn ?? "") < (b.completedOn ?? "") ? -1 : 1));
          return (
            hits[0] ?? {
              current: Math.max(0, ...[...weeks.values()].map((l) => l.length)),
              target: 2,
              completedOn: null,
              evidence: [],
            }
          );
        },
      },
    ],
  },
  {
    id: "K4",
    name: "Release Train",
    reward: { bp: 300, cosmetic: "badge-style:shipper" },
    available: true,
    steps: [
      {
        text: "A qualifying release with non-empty release notes",
        evaluate: (c) => firstDay(c.facts.releases.filter((r) => r.hasNotes)),
      },
      {
        text: "Qualifying releases in 2 different months",
        evaluate: (c) =>
          distinctProgress(
            c.facts.releases.map((r) => ({ ...r, group: r.day.slice(0, 7) })),
            2,
          ),
      },
      {
        text: "A release with ≥ 10 qualifying commits since the previous one",
        evaluate: (c) => firstDay(c.facts.releases.filter((r) => r.commitsSincePrevious >= 10)),
      },
    ],
  },
  {
    id: "K5",
    name: "Rising Through the Ranks",
    reward: { bp: 400, cosmetic: "title:ascending" },
    available: true,
    steps: [
      {
        text: "Complete the Champion trial",
        evaluate: (c) => reachedAny(c, (s) => s.trialMet.champion),
      },
      {
        text: "Reach Champion II",
        evaluate: (c) => reachedAny(c, (s) => s.history.find((h) => h.stars >= 47)?.day),
      },
      {
        text: "End a season at Champion or above",
        evaluate: (c) =>
          firstDay(
            c.ctx.ledger.entries
              .filter(
                (e) =>
                  e.rule === "season.close" &&
                  ["champion", "paragon", "ascendant", "eternal"].includes(
                    String(e.meta?.peakTier),
                  ),
              )
              .map((e) => ({ day: e.effectiveDay ?? "", id: e.id })),
          ),
      },
    ],
  },
  {
    id: "K6",
    name: "Open Waters",
    reward: { bp: 400, cosmetic: "title:open-source-ally" },
    available: true,
    steps: [
      {
        text: "Open an issue in another person's repo",
        evaluate: (c) => firstDay(c.facts.issuesOpened.filter((i) => i.external)),
      },
      {
        text: "An external merge containing ≥ 2 commits",
        evaluate: (c) => firstDay(c.facts.prs.filter((p) => p.external && p.commitCount >= 2)),
      },
      {
        text: "3 external merges in ≥ 2 repos",
        evaluate: (c) => {
          const ext = c.facts.prs.filter((p) => p.external);
          const count = countProgress(ext, 3);
          const repos = distinctProgress(
            ext.map((p) => ({ ...p, group: p.repo })),
            2,
          );
          const day =
            count.completedOn && repos.completedOn
              ? count.completedOn > repos.completedOn
                ? count.completedOn
                : repos.completedOn
              : null;
          return {
            current: Math.min(count.current, 3),
            target: 3,
            completedOn: day,
            evidence: count.evidence,
          };
        },
      },
    ],
  },
  {
    id: "K7",
    name: "Attunement",
    reward: { bp: 300 },
    available: true,
    steps: [
      { text: "Attune an emblem", evaluate: (c) => firstDay(ledgerDays(c, "emblem.attune|")) },
      {
        text: "An attuned emblem reaches level 3",
        evaluate: (c) => {
          const attuned = new Set(
            c.ctx.ledger.entries
              .filter((e) => e.rule === "emblem.attune")
              .map((e) => String(e.meta?.emblem)),
          );
          return firstDay(
            ledgerDays(c, "emblem.level|").filter(
              (x) => x.id.endsWith("|3") && attuned.has(x.id.split("|")[1] ?? ""),
            ),
          );
        },
      },
      {
        text: "Complete 4 specialty quests",
        evaluate: (c) =>
          countProgress(
            c.ctx.ledger.entries
              .filter((e) => e.rule === "quest.complete" && e.meta?.pool === "specialty")
              .map((e) => ({ day: e.effectiveDay ?? "", id: e.id })),
            4,
          ),
      },
    ],
  },
  {
    id: "K8",
    name: "Gear Up",
    reward: { bp: 250, cosmetic: "frame:outfitter" },
    available: true,
    steps: [
      {
        text: "Equip 3 verified items",
        evaluate: (c) => {
          const n = c.spec.equipment.build.filter((s) => s.state === "verified").length;
          return { current: n, target: 3, completedOn: n >= 3 ? today(c) : null, evidence: [] };
        },
      },
      {
        text: "An item reaches Rare",
        evaluate: (c) =>
          firstDay(ledgerDays(c, "equipment.tier|").filter((x) => x.id.endsWith("|rare"))),
      },
      {
        text: "Complete Green Lane 5 times",
        evaluate: (c) => countProgress(ledgerDays(c, "quest|D09|"), 5),
      },
    ],
  },
  {
    id: "K9",
    name: "Squad Formation",
    reward: { bp: 300 },
    available: false,
    unavailableReason: "The squad system is not implemented",
    steps: [
      { text: "First verified ally", evaluate: () => done(null, []) },
      { text: "2 verified allies", evaluate: () => done(null, []) },
      { text: "Squad strength ≥ 30", evaluate: () => done(null, []) },
    ],
  },
  {
    id: "K10",
    name: "Long Road",
    reward: { bp: 500, cosmetic: "title:long-roader" },
    available: true,
    steps: [
      {
        text: "Season badges in 4 consecutive seasons",
        evaluate: (c) => {
          const closed = c.ctx.ledger.entries
            .filter((e) => e.rule === "season.close")
            .map((e) => ({ n: Number((e.season ?? "S0").slice(1)), day: e.effectiveDay ?? "" }))
            .sort((a, b) => a.n - b.n);
          let run = 0;
          for (let i = 0; i < closed.length; i++) {
            run = i > 0 && closed[i]?.n === (closed[i - 1]?.n ?? 0) + 1 ? run + 1 : 1;
            if (run >= 4) return done(closed[i]?.day ?? null, [`season.close|S${closed[i]?.n}`]);
          }
          return { current: run, target: 4, completedOn: null, evidence: [] };
        },
      },
      {
        text: "Reach level 50",
        evaluate: (c) => {
          const need = cumulativeExpForLevel(50, c.ctx.rules);
          let total = 0;
          const exps = c.ctx.ledger.entries
            .filter((e) => e.kind === "exp" && e.amount > 0)
            .sort((a, b) =>
              (a.eventDay ?? "") < (b.eventDay ?? "")
                ? -1
                : (a.eventDay ?? "") > (b.eventDay ?? "")
                  ? 1
                  : a.id < b.id
                    ? -1
                    : 1,
            );
          for (const e of exps) {
            total += e.amount;
            if (total >= need) return done(e.eventDay ?? null, [e.id]);
          }
          return { current: total, target: need, completedOn: null, evidence: [] };
        },
      },
      {
        text: "Any hero reaches Virtuoso",
        evaluate: (c) =>
          firstDay(
            ledgerDays(c, "mastery|").filter((x) => x.id.endsWith(`|${MASTERY_TIERS[4]?.id}`)),
          ),
      },
    ],
  },
];

/** Records steps in order and pays the campaign reward once all steps are done. */
export function runCampaigns(c: CampaignContext): CampaignView[] {
  const { ctx } = c;
  const views: CampaignView[] = [];
  for (const def of CAMPAIGNS) {
    let previousDay = "";
    const steps: CampaignView["steps"] = [];
    let chainIntact = def.available;
    def.steps.forEach((step, i) => {
      const id = `campaign.step|${def.id}|${i + 1}`;
      const progress = step.evaluate(c);
      if (chainIntact && !ctx.ledger.has(id) && progress.completedOn) {
        const day = progress.completedOn > previousDay ? progress.completedOn : previousDay;
        ctx.ledger.add({
          id,
          kind: "campaign",
          rule: "campaign.step",
          ruleVersion: ctx.rules.version,
          subject: [`campaign:${def.id}`],
          amount: 0,
          effectiveDay: day,
          createdAt: ctx.runAt,
          meta: {
            campaign: def.id,
            step: i + 1,
            evidence: progress.evidence.slice(0, 5).join(","),
          },
        });
      }
      const recorded = ctx.ledger.get(id);
      chainIntact &&= recorded !== undefined;
      if (recorded) previousDay = recorded.effectiveDay ?? previousDay;
      steps.push({
        index: i + 1,
        text: step.text,
        done: recorded !== undefined,
        doneOn: recorded?.effectiveDay ?? null,
        progress,
      });
    });
    const completeId = `campaign|${def.id}`;
    if (chainIntact && !ctx.ledger.has(completeId)) {
      const season = seasonOf(previousDay, ctx.config.season1Start);
      ctx.ledger.add({
        id: completeId,
        kind: "campaign",
        rule: "campaign.complete",
        ruleVersion: ctx.rules.version,
        subject: [`campaign:${def.id}`],
        amount: 0,
        effectiveDay: previousDay,
        createdAt: ctx.runAt,
        ...(season ? { season: season.id } : {}),
        meta: { campaign: def.id },
      });
      ctx.ledger.add({
        id: `bp.campaign|${def.id}`,
        kind: "bp",
        rule: "bp.campaign",
        ruleVersion: ctx.rules.version,
        subject: [`campaign:${def.id}`],
        amount: def.reward.bp,
        effectiveDay: previousDay,
        createdAt: ctx.runAt,
        ...(season ? { season: season.id } : {}),
        meta: {
          campaign: def.id,
          ...(def.reward.cosmetic ? { cosmetic: def.reward.cosmetic } : {}),
        },
      });
    }
    const completion = ctx.ledger.get(completeId);
    views.push({
      id: def.id,
      name: def.name,
      reward: def.reward,
      available: def.available,
      completed: completion !== undefined,
      completedOn: completion?.effectiveDay ?? null,
      steps,
    });
  }
  return views;
}

/** The first incomplete, available campaign (README "featured campaign"). */
export function featuredCampaign(views: readonly CampaignView[]): CampaignView | null {
  return views.find((v) => v.available && !v.completed) ?? null;
}
