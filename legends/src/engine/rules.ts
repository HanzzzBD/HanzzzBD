/**
 * Ruleset v1: a direct transcription of the approved tables. Do not edit values here
 * without a ruleset version bump and a matching change in:
 *   docs/game-design/progression-tables.md (levels §1, ranks §2, battles §2.1, reset §2.2, season BP §2.3)
 *   docs/game-design/economy-balancing.md §2–3 (EXP values, caps, activity BP, weekly cap)
 *   docs/game-design/game-design-document.md §1.4–1.6 (objectives, duplicates, automation), §A (promotion)
 *   docs/product/prd.md §4 (qualification, stacking, effective dates)
 * The test suite asserts these values row by row against the documented tables.
 */
export type TierId =
  | "initiate"
  | "squire"
  | "knight"
  | "warden"
  | "champion"
  | "paragon"
  | "ascendant"
  | "eternal";

export interface TrialRule {
  objectives: number;
  contested: number;
  repos?: number;
  counterparts?: number;
}

export interface TierRule {
  id: TierId;
  name: string;
  /** 3 for tiered divisions, 1 for Ascendant, 0 for Eternal (open-ended star count). */
  divisions: 0 | 1 | 3;
  /** Stars per division; 0 for Eternal. */
  starsPerDivision: number;
  trial?: TrialRule;
  /** First-time-reached BP per season (none for Initiate). */
  firstTimeBp: number;
  /** Season-end BP when this is the peak tier. */
  seasonEndBp: number;
}

export const RULESET_V1 = {
  version: "1.0.0",
  exp: {
    /** EXP for the 1st…10th qualifying commit of a player day; 11th and later earn 0 (R-01). */
    commitCurve: [10, 10, 10, 10, 10, 5, 5, 5, 5, 5] as readonly number[],
    prSelf: 15,
    prSelfDailyCount: 2,
    prContested: 60,
    prDailyCap: 150,
    review: 25,
    reviewDailyCap: 100,
    issueOpened: 10,
    issueOpenedDailyCap: 30,
    issueOpenedSettleHours: 24,
    issueResolved: 15,
    issueResolvedDailyCap: 45,
    releaseFull: 50,
    releasePre: 20,
    releaseDailyCap: 100,
    releaseRepoCooldownDays: 7,
    releaseMinCommits: 3,
    privatePerContribution: 4,
    privateWeeklyCap: 200,
  },
  level: {
    base: 100,
    step: 50,
    max: 100,
    bpPerLevel: 25,
    bpEveryTenthBonus: 100,
    titles: {
      1: "Rookie",
      10: "Journeyman",
      20: "Adventurer",
      30: "Veteran",
      40: "Vanguard",
      50: "Hero",
      60: "Paladin",
      75: "Mythsmith",
      100: "Living Legend",
    } as Readonly<Record<number, string>>,
  },
  battle: {
    victoryScore: 30,
    mvpScore: 100,
    victoryBp: 15,
    /** MVP total is 30 BP: 15 from the Victory plus a 15 BP upgrade. */
    mvpBp: 30,
    weeklyStarCap: 5,
  },
  tiers: [
    {
      id: "initiate",
      name: "Initiate",
      divisions: 3,
      starsPerDivision: 3,
      firstTimeBp: 0,
      seasonEndBp: 100,
    },
    {
      id: "squire",
      name: "Squire",
      divisions: 3,
      starsPerDivision: 3,
      firstTimeBp: 30,
      seasonEndBp: 150,
    },
    {
      id: "knight",
      name: "Knight",
      divisions: 3,
      starsPerDivision: 4,
      firstTimeBp: 50,
      seasonEndBp: 250,
    },
    {
      id: "warden",
      name: "Warden",
      divisions: 3,
      starsPerDivision: 4,
      firstTimeBp: 80,
      seasonEndBp: 350,
    },
    {
      id: "champion",
      name: "Champion",
      divisions: 3,
      starsPerDivision: 5,
      trial: { objectives: 3, contested: 1 },
      firstTimeBp: 120,
      seasonEndBp: 500,
    },
    {
      id: "paragon",
      name: "Paragon",
      divisions: 3,
      starsPerDivision: 5,
      trial: { objectives: 8, contested: 3 },
      firstTimeBp: 180,
      seasonEndBp: 650,
    },
    {
      id: "ascendant",
      name: "Ascendant",
      divisions: 1,
      starsPerDivision: 20,
      trial: { objectives: 15, contested: 6, repos: 2 },
      firstTimeBp: 250,
      seasonEndBp: 800,
    },
    {
      id: "eternal",
      name: "Eternal",
      divisions: 0,
      starsPerDivision: 0,
      trial: { objectives: 25, contested: 10, counterparts: 3 },
      firstTimeBp: 400,
      seasonEndBp: 1000,
    },
  ] as readonly TierRule[],
  softResetTiers: 3,
  bp: {
    /** Activity BP = floor(EXP × 20 / 100). Integer maths only. */
    activityPercent: 20,
    /** Activity + battle BP per ISO week. */
    weeklyCap: 700,
  },
  objectives: {
    humanMinAccountAgeDays: 30,
    releaseObjectivesPerWeek: 2,
  },
  automation: {
    windowDays: 30,
    clockworkMinDays: 10,
    clockworkToleranceMinutes: 2,
    clockworkMinSharePercent: 80,
    microFloodMinSharePercent: 70,
    microFloodMaxMedianLines: 3,
    /** Commits that reach the daily commit EXP maximum (10 commits = 75 EXP). */
    microFloodDailyCommits: 10,
  },
  duplicates: { fingerprintWindowDays: 30 },
  time: {
    effectiveGraceHours: 48,
    closureGraceHours: 48,
    earliestValidInstant: "2008-01-01T00:00:00Z",
    maxAheadOfFirstSeenHours: 24,
  },
} as const;

export type Ruleset = typeof RULESET_V1;
