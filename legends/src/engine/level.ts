import type { Ruleset } from "./rules.ts";

/** Cumulative EXP needed to reach level n: base·(n−1) + step·(n−1)(n−2)/2. */
export function cumulativeExpForLevel(n: number, rules: Ruleset): number {
  if (!Number.isInteger(n) || n < 1) throw new Error("level must be a positive integer");
  const { base, step } = rules.level;
  return base * (n - 1) + (step * (n - 1) * (n - 2)) / 2;
}

/** EXP needed to go from level n to n+1, or null at the maximum level. */
export function expToNextLevel(n: number, rules: Ruleset): number | null {
  return n >= rules.level.max ? null : rules.level.base + rules.level.step * (n - 1);
}

export function levelForExp(exp: number, rules: Ruleset): number {
  if (!Number.isFinite(exp) || exp < 0) throw new Error("exp must be a non-negative number");
  let level = 1;
  while (level < rules.level.max && cumulativeExpForLevel(level + 1, rules) <= exp) level++;
  return level;
}

export interface LevelProgress {
  exp: number;
  level: number;
  title: string;
  /** EXP earned inside the current level. */
  expIntoLevel: number;
  /** EXP span of the current level; null at the maximum level. */
  expForNext: number | null;
  /** EXP still needed for the next level; null at the maximum level. */
  expRemaining: number | null;
  /** EXP beyond the maximum level's threshold (0 below the maximum). */
  overflow: number;
}

export function titleForLevel(level: number, rules: Ruleset): string {
  let title = rules.level.titles[1] ?? "";
  for (const [threshold, name] of Object.entries(rules.level.titles)) {
    if (level >= Number(threshold)) title = name;
  }
  return title;
}

export function levelProgress(exp: number, rules: Ruleset): LevelProgress {
  const level = levelForExp(exp, rules);
  const into = exp - cumulativeExpForLevel(level, rules);
  const span = expToNextLevel(level, rules);
  return {
    exp,
    level,
    title: titleForLevel(level, rules),
    expIntoLevel: span === null ? 0 : into,
    expForNext: span,
    expRemaining: span === null ? null : span - into,
    overflow: span === null ? into : 0,
  };
}

/** Level-up BP for reaching level n (n ≥ 2): 25, plus 100 on multiples of 10. */
export function levelUpBp(n: number, rules: Ruleset): number {
  return rules.level.bpPerLevel + (n % 10 === 0 ? rules.level.bpEveryTenthBonus : 0);
}
