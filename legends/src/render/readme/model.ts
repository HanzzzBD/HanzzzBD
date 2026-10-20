/**
 * Profile view model: everything the README block and its cards show, computed once from
 * one engine run. Every number comes from the ledger, season state or specialization
 * result. Anything that has no source is `null` and rendered as "—", never guessed
 * (PRD INT-5: no fake zeros).
 */
import { z } from "zod";
import type { EngineOutput, RankProgress } from "../../engine/engine.ts";
import {
  type EmblemPanelView,
  type EquipmentPanelView,
  emblemPanel,
  equipmentPanel,
  type HeroCardView,
  heroCard,
  heroLineup,
} from "../../engine/heroes/presentation.ts";
import type { LedgerEntry } from "../../engine/ledger.ts";
import type { MedalView } from "../../engine/medals.ts";
import { type CampaignView, featuredCampaign } from "../../engine/quests/campaigns.ts";
import type { QuestBoardsView } from "../../engine/quests/engine.ts";
import type { SeasonArchive } from "../../engine/seasons.ts";
import { addDays, parseInstant } from "../../engine/time.ts";
import type { MapState } from "../map/schema.ts";
import { buildMapState } from "../map/state.ts";
import { initials, sanitizeLabel, stripPictographs } from "../text.ts";

export const SECTION_IDS = [
  "lobby",
  "statistics",
  "level",
  "rank",
  "season",
  "heroes",
  "mastery",
  "emblems",
  "equipment",
  "quests",
  "medals",
  "map",
  "battles",
  "squad",
  "identity",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** Sections that are off unless configured (squad needs other people's consent and data). */
export const OPTIONAL_SECTIONS: readonly SectionId[] = ["squad"];

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** The `readme` section of the player config. Unknown keys are rejected. */
export const ProfileConfigSchema = z.strictObject({
  /** GitHub login of the player (links only; never used to fetch anything here). */
  login: z.string().regex(LOGIN, "invalid GitHub login"),
  /** Display name on the player card. Defaults to the login. */
  displayName: z.string().min(1).max(100).optional(),
  /** Short label for the player's timezone in "updated" lines, e.g. "WIB". */
  timezoneLabel: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9+/_ -]{0,31}$/)
    .optional(),
  /** Sections to leave out. "squad" is also off unless listed in `enable`. */
  disable: z.array(z.enum(SECTION_IDS)).default([]),
  enable: z.array(z.enum(SECTION_IDS)).default([]),
  /** How many public repositories to link in the identity section (0 hides the list). */
  featuredRepos: z.number().int().min(0).max(8).default(4),
  /** Days after which the data is reported as stale (PRD §6.16). */
  staleAfterDays: z.number().int().min(1).max(30).default(3),
});
export type ProfileConfig = z.infer<typeof ProfileConfigSchema>;

export interface ProfileInput {
  output: EngineOutput;
  config: z.input<typeof ProfileConfigSchema>;
  /** Instant of the last run whose collection was complete (from the state store). */
  lastSuccessfulRefresh: string;
  /** GitHub contribution calendar days (for the streak). Omit when not collected. */
  calendar?: ReadonlyArray<{ date: string; count: number }>;
  /** Fixture and preview renders: watermark everything. */
  sample?: boolean;
}

export interface BattleRow {
  day: string;
  result: "mvp" | "victory" | "skirmish";
  score: number;
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  releases: number;
}

export interface ProfileModel {
  sample: boolean;
  stale: boolean;
  generatedAt: string;
  updatedLabel: string;
  lastRefreshLabel: string;
  sections: ReadonlySet<SectionId>;
  player: {
    login: string;
    name: string;
    initials: string;
    level: number;
    title: string;
    exp: number;
    expIntoLevel: number;
    expForNext: number | null;
    expRemaining: number | null;
    levelPercent: number;
    bp: number;
    streak: number | null;
    mainHero: { name: string; technology: string } | null;
    emblem: { name: string; level: number } | null;
  };
  stats: {
    commits: number;
    mergedPrs: number;
    reviews: number;
    issuesOpened: number;
    issuesResolved: number;
    releases: number;
    battles: number;
    victories: number;
    mvps: number;
    medals: number;
    medalTiers: number;
    questsCompleted: number;
    campaignsCompleted: number;
    heroesUnlocked: number;
    heroesDiscovered: number;
  };
  rank: (RankProgress & { seasonNumber: number }) | null;
  season: {
    id: string;
    startDay: string;
    endDay: string;
    daysLeft: number;
    battles: number;
    victories: number;
    mvps: number;
    bpEarned: number;
  } | null;
  archives: SeasonArchive[];
  lineup: HeroCardView[];
  collection: HeroCardView[];
  emblems: EmblemPanelView;
  equipment: EquipmentPanelView;
  quests: QuestBoardsView;
  campaign: CampaignView | null;
  medals: { earned: MedalView[]; showcase: MedalView[]; next: MedalView | null };
  map: MapState;
  battles: BattleRow[];
  collaboration: {
    reviewedMerges: number;
    externalMerges: number;
    peerReviews: number;
    communityFixes: number;
    collaborators: number;
  };
  repos: Array<{ fullName: string; exp: number }>;
}

const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];
const count = (ledger: readonly LedgerEntry[], pred: (e: LedgerEntry) => boolean) =>
  ledger.filter(pred).length;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20 Oct 2026, 00:17 WIB" in the player's timezone. */
export function formatInstant(iso: string, timezone: string, label: string): string {
  const ms = parseInstant(iso);
  if (ms === null) return "unknown";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}, ${parts.hour}:${parts.minute} ${label}`;
}

/** "20 Oct" or "20 Oct 2026" from a player day. */
export function formatDay(day: string, withYear = false): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}${withYear ? ` ${y}` : ""}`;
}

/** Current streak: consecutive calendar days with contributions, ending today or yesterday. */
function currentStreak(
  calendar: ReadonlyArray<{ date: string; count: number }> | undefined,
  today: string,
): number | null {
  if (!calendar) return null;
  const active = new Set(calendar.filter((c) => c.count > 0).map((c) => c.date));
  let day = active.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (active.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

function battleRows(ledger: readonly LedgerEntry[]): BattleRow[] {
  const rows = new Map<string, BattleRow>();
  const row = (day: string) => {
    let r = rows.get(day);
    if (!r) {
      r = {
        day,
        result: "skirmish",
        score: 0,
        commits: 0,
        prs: 0,
        reviews: 0,
        issues: 0,
        releases: 0,
      };
      rows.set(day, r);
    }
    return r;
  };
  for (const e of ledger) {
    const day = e.effectiveDay;
    if (!day) continue;
    if (e.kind === "exp" && e.rule !== "exp.private") {
      const r = row(day);
      r.score += e.amount;
      if (e.rule === "exp.commit" && e.amount > 0) r.commits++;
      else if (e.rule === "exp.pr") r.prs++;
      else if (e.rule === "exp.review") r.reviews++;
      else if (e.rule.startsWith("exp.issue")) r.issues++;
      else if (e.rule === "exp.release") r.releases++;
    }
  }
  for (const e of ledger) {
    if (e.kind !== "star" || !e.effectiveDay) continue;
    const r = rows.get(e.effectiveDay);
    if (!r) continue;
    if (e.rule === "star.mvp") r.result = "mvp";
    else if (e.rule === "star.victory" && r.result !== "mvp") r.result = "victory";
  }
  return [...rows.values()].filter((r) => r.score > 0).sort((a, b) => (a.day < b.day ? 1 : -1));
}

export function buildProfileModel(input: ProfileInput): ProfileModel {
  const config = ProfileConfigSchema.parse(input.config);
  const { output } = input;
  const ledger = output.ledger;
  const timezone = output.schedule.timezone;
  const today = output.schedule.today;
  const label = config.timezoneLabel ?? (timezone === "Asia/Jakarta" ? "WIB" : timezone);
  const generatedMs = parseInstant(output.schedule.asOf) ?? 0;
  const refreshMs = parseInstant(input.lastSuccessfulRefresh);
  const stale = refreshMs === null || generatedMs - refreshMs > config.staleAfterDays * 86_400_000;

  const sections = new Set<SectionId>(
    SECTION_IDS.filter((s) => !OPTIONAL_SECTIONS.includes(s) || config.enable.includes(s)),
  );
  for (const s of config.disable) sections.delete(s);

  const name =
    sanitizeLabel(stripPictographs(config.displayName ?? config.login), 64) || config.login;
  const life = output.records.lifetime;
  const spec = output.specialization;
  const lineup = heroLineup(spec.heroes);
  const main = lineup.find((h) => h.isMain) ?? null;
  const emblems = emblemPanel(spec.emblems);
  const battles = battleRows(ledger);

  const medalRows = output.medals.filter((m) => m.available);
  const earned = medalRows
    .filter((m) => m.earned)
    .sort((a, b) => ((a.earnedOn ?? "") < (b.earnedOn ?? "") ? 1 : -1));
  const recent = earned.slice(0, 3);
  const rarest = [...earned]
    .filter((m) => !recent.includes(m))
    .sort(
      (a, b) =>
        RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) ||
        ((a.earnedOn ?? "") < (b.earnedOn ?? "") ? 1 : -1),
    )
    .slice(0, 3);
  const next =
    medalRows
      .filter((m) => !m.earned && !m.hidden && m.progress.target > 0)
      .sort(
        (a, b) =>
          b.progress.current / b.progress.target - a.progress.current / a.progress.target ||
          (a.id < b.id ? -1 : 1),
      )[0] ?? null;

  const objectives = (type: string) => count(ledger, (e) => e.rule === `objective.${type}`);
  const collaborators = new Set(
    ledger
      .filter((e) => e.kind === "trial")
      .flatMap((e) =>
        String(e.meta?.counterparts ?? "")
          .split(",")
          .filter(Boolean),
      ),
  );

  const repoExp = new Map<string, number>();
  for (const c of spec.attribution.credits) {
    const repo = c.repo;
    if (repo.visibility !== "public" || repo.isFork || !repo.fullName || !repo.ownedByPlayer)
      continue;
    repoExp.set(repo.fullName, (repoExp.get(repo.fullName) ?? 0) + c.exp);
  }
  const repos = [...repoExp.entries()]
    .filter(
      ([fullName]) =>
        /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(fullName) &&
        !fullName.split("/")[1]?.startsWith("."),
    )
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, config.featuredRepos)
    .map(([fullName, exp]) => ({ fullName, exp }));

  const season = output.records.current;
  const rank = output.progress.season;

  return {
    sample: input.sample ?? false,
    stale,
    generatedAt: output.schedule.asOf,
    updatedLabel: formatInstant(output.schedule.asOf, timezone, label),
    lastRefreshLabel:
      refreshMs === null ? "never" : formatInstant(input.lastSuccessfulRefresh, timezone, label),
    sections,
    player: {
      login: config.login,
      name,
      initials: initials(name),
      level: life.level,
      title: life.title,
      exp: life.exp,
      expIntoLevel: life.expIntoLevel,
      expForNext: life.expForNext,
      expRemaining: life.expRemaining,
      levelPercent: life.expForNext ? Math.floor((life.expIntoLevel * 100) / life.expForNext) : 100,
      bp: life.bp,
      streak: currentStreak(input.calendar, today),
      mainHero: main ? { name: main.name, technology: main.technology } : null,
      emblem: emblems.active ? { name: emblems.active.name, level: emblems.active.level } : null,
    },
    stats: {
      commits: count(ledger, (e) => e.rule === "exp.commit"),
      mergedPrs: count(ledger, (e) => e.rule === "exp.pr"),
      reviews: count(ledger, (e) => e.rule === "exp.review"),
      issuesOpened: count(ledger, (e) => e.rule === "exp.issue_opened"),
      issuesResolved: count(ledger, (e) => e.rule === "exp.issue_resolved"),
      releases: count(ledger, (e) => e.rule === "exp.release"),
      battles: battles.length,
      victories: battles.filter((b) => b.result !== "skirmish").length,
      mvps: battles.filter((b) => b.result === "mvp").length,
      medals: earned.length,
      medalTiers: medalRows.length,
      questsCompleted: life.questsCompleted,
      campaignsCompleted: life.campaignsCompleted,
      heroesUnlocked: spec.heroes.filter((h) => h.kind === "hero" && h.state === "unlocked").length,
      heroesDiscovered: spec.heroes.filter((h) => h.kind === "hero" && h.state === "discovered")
        .length,
    },
    rank: rank ? { ...rank, seasonNumber: Number(rank.seasonId.slice(1)) } : null,
    season: season
      ? {
          id: season.seasonId,
          startDay: season.startDay,
          endDay: season.endDay,
          daysLeft: season.daysLeft,
          battles: season.stats.battles,
          victories: season.stats.victories,
          mvps: season.stats.mvps,
          bpEarned: season.stats.bpEarned,
        }
      : null,
    archives: output.records.archived.slice(-3),
    lineup,
    collection: spec.heroes
      .map((h) => heroCard(h))
      .filter((c): c is HeroCardView => c !== null && c.state === "unlocked")
      .sort((a, b) => b.mastery.mp - a.mastery.mp || (a.id < b.id ? -1 : 1)),
    emblems,
    equipment: equipmentPanel(spec.equipment),
    quests: output.quests,
    campaign: featuredCampaign(output.campaigns),
    medals: { earned, showcase: [...recent, ...rarest], next },
    map: buildMapState(output, { name, sample: input.sample ?? false, stale }),
    battles: battles.slice(0, 10),
    collaboration: {
      reviewedMerges: objectives("reviewed_merge"),
      externalMerges: objectives("external_merge"),
      peerReviews: objectives("peer_review"),
      communityFixes: objectives("community_fix"),
      collaborators: collaborators.size,
    },
    repos,
  };
}
