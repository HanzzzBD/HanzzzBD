import type { Ruleset, TierId, TierRule, TrialRule } from "./rules.ts";

export function tierEntries(rules: Ruleset): number[] {
  const entries: number[] = [];
  let total = 0;
  for (const tier of rules.tiers) {
    entries.push(total);
    total += tier.divisions * tier.starsPerDivision;
  }
  return entries;
}

export interface RankPosition {
  tierIndex: number;
  tier: TierId;
  name: string;
  /** 3, 2 or 1 for divided tiers (III, II, I); null for Ascendant and Eternal. */
  division: 1 | 2 | 3 | null;
  starsInDivision: number;
  /** Null for Eternal (open-ended). */
  starsForDivision: number | null;
  /** e.g. "Paragon II", "Ascendant ★6", "Eternal ★8". */
  label: string;
}

const ROMAN = { 3: "III", 2: "II", 1: "I" } as const;

export function rankFromStars(stars: number, rules: Ruleset): RankPosition {
  if (!Number.isInteger(stars) || stars < 0)
    throw new Error("stars must be a non-negative integer");
  const entries = tierEntries(rules);
  let index = 0;
  for (let i = 0; i < rules.tiers.length; i++) if (stars >= (entries[i] ?? 0)) index = i;
  const tier = rules.tiers[index] as TierRule;
  const within = stars - (entries[index] ?? 0);
  if (tier.divisions === 0) {
    return {
      tierIndex: index,
      tier: tier.id,
      name: tier.name,
      division: null,
      starsInDivision: within,
      starsForDivision: null,
      label: `${tier.name} ★${within}`,
    };
  }
  if (tier.divisions === 1) {
    return {
      tierIndex: index,
      tier: tier.id,
      name: tier.name,
      division: null,
      starsInDivision: within,
      starsForDivision: tier.starsPerDivision,
      label: `${tier.name} ★${within}`,
    };
  }
  const step = Math.floor(within / tier.starsPerDivision);
  const division = (3 - step) as 1 | 2 | 3;
  return {
    tierIndex: index,
    tier: tier.id,
    name: tier.name,
    division,
    starsInDivision: within - step * tier.starsPerDivision,
    starsForDivision: tier.starsPerDivision,
    label: `${tier.name} ${ROMAN[division]}`,
  };
}

export interface TrialProgress {
  objectives: number;
  contested: number;
  repos: number;
  counterparts: number;
}

export function trialMet(trial: TrialRule | undefined, p: TrialProgress): boolean {
  if (!trial) return true;
  return (
    p.objectives >= trial.objectives &&
    p.contested >= trial.contested &&
    p.repos >= (trial.repos ?? 0) &&
    p.counterparts >= (trial.counterparts ?? 0)
  );
}

/**
 * Applies promotion trials (GDD A.4 rule 4): stars that would cross into a gated tier
 * whose trial is incomplete are held at the previous tier's division I. Tiers at or
 * below the season's starting position are not gated again (GDD A.5).
 */
export function gateStars(
  rawStars: number,
  startStars: number,
  progress: TrialProgress,
  rules: Ruleset,
): { effective: number; banked: number; blockedBy: TierId | null } {
  const entries = tierEntries(rules);
  for (let i = 0; i < rules.tiers.length; i++) {
    const tier = rules.tiers[i] as TierRule;
    const entry = entries[i] ?? 0;
    if (!tier.trial || entry <= startStars) continue;
    if (rawStars >= entry && !trialMet(tier.trial, progress)) {
      return { effective: entry - 1, banked: rawStars - (entry - 1), blockedBy: tier.id };
    }
  }
  return { effective: rawStars, banked: 0, blockedBy: null };
}

/** Starting stars after the soft reset (−3 tiers, never below Initiate III). */
export function softResetStars(finalStars: number, rules: Ruleset): number {
  const position = rankFromStars(finalStars, rules);
  const target = Math.max(0, position.tierIndex - rules.softResetTiers);
  return tierEntries(rules)[target] ?? 0;
}

export function tierRule(id: TierId, rules: Ruleset): TierRule {
  const tier = rules.tiers.find((t) => t.id === id);
  if (!tier) throw new Error(`unknown tier ${id}`);
  return tier;
}
