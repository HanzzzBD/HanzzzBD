/**
 * Hero collection and mastery (GDD §C.3–C.5, progression-tables §4).
 *
 * Mastery points (MP) = Σ commit EXP × the technology's byte share, per award, using the
 * snapshot from the award time. MP measures VERIFIED ACTIVITY VOLUME with a technology. It
 * is not a skill rating, and no state here claims proficiency.
 */
import type { LedgerEntry, LedgerIndex } from "../ledger.ts";
import type { Diagnostics } from "../qualify.ts";
import { dayOf, parseInstant } from "../time.ts";
import type { Attribution } from "./attribution.ts";
import { milliShare } from "./attribution.ts";
import {
  HERO_UNLOCK,
  HEROES,
  type HeroDef,
  heroForLanguage,
  MASTERY_TIERS,
  type MasteryTierDef,
  type MasteryTierId,
  masteryTierFor,
  unknownSpiritId,
} from "./catalog.ts";

export type HeroStateId = "undiscovered" | "discovered" | "unlocked";

export interface TierRecord {
  tier: MasteryTierId;
  /** Player day on which the tier was first recorded. */
  reachedOn: string;
}

export interface HeroState {
  id: string;
  kind: "hero" | "unknown_spirit";
  /** Catalog definition (null for unknown spirits). */
  hero: HeroDef | null;
  /** Linguist languages that contributed. */
  languages: string[];
  state: HeroStateId;
  /** Mastery points (floor of milli-points / 1000). */
  mp: number;
  tier: MasteryTierId | null;
  tierHistory: TierRecord[];
  /** Eligible repos where the technology contributed MP. */
  repos: number;
  /** Repos that satisfy the unlock rule's repo condition (≥ 5 qualifying commits and ≥ 10% share). */
  unlockRepos: number;
  lastActive: string | null;
  /** True when some MP came from awards older than the repo's first language snapshot. */
  approximate: boolean;
  isMain: boolean;
  hidden: boolean;
}

export interface HeroConfig {
  main?: string | null;
  hide?: readonly string[];
}

interface Accumulator {
  milli: number;
  repos: Set<string>;
  lastActive: string | null;
  approximate: boolean;
  languages: Set<string>;
}

export function evaluateHeroes(
  attribution: Attribution,
  ledger: LedgerIndex,
  config: HeroConfig | undefined,
  rulesVersion: string,
  runAt: string,
  timezone: string,
  diagnostics: Diagnostics,
): HeroState[] {
  const acc = new Map<string, Accumulator>();
  const idFor = (language: string) => heroForLanguage(language)?.id ?? unknownSpiritId(language);
  for (const credit of attribution.credits) {
    if (!credit.languages) continue;
    for (const language of Object.keys(credit.languages).sort()) {
      const bytes = credit.languages[language] ?? 0;
      const milli = milliShare(credit.exp, bytes, credit.totalBytes);
      if (milli <= 0) continue;
      const id = idFor(language);
      const a = acc.get(id) ?? {
        milli: 0,
        repos: new Set<string>(),
        lastActive: null,
        approximate: false,
        languages: new Set<string>(),
      };
      a.milli += milli;
      a.repos.add(credit.repo.id);
      a.languages.add(language);
      if (a.lastActive === null || credit.eventDay > a.lastActive) a.lastActive = credit.eventDay;
      a.approximate ||= credit.approximate;
      acc.set(id, a);
    }
  }

  // Repo condition of the unlock rule, on current shares: ≥ 5 qualifying commits and ≥ 10% share.
  const unlockRepos = new Map<string, number>();
  for (const facts of attribution.repos.values()) {
    if (facts.qualifyingCommits < HERO_UNLOCK.minRepoCommits || !facts.latestLanguages) continue;
    const total = Object.values(facts.latestLanguages).reduce((s, b) => s + b, 0);
    if (total <= 0) continue;
    const perHero = new Map<string, number>();
    for (const [language, bytes] of Object.entries(facts.latestLanguages)) {
      perHero.set(idFor(language), (perHero.get(idFor(language)) ?? 0) + bytes);
    }
    for (const [id, bytes] of perHero) {
      if (bytes * 100 >= HERO_UNLOCK.minSharePercent * total)
        unlockRepos.set(id, (unlockRepos.get(id) ?? 0) + 1);
    }
  }

  const runMs = parseInstant(runAt) ?? 0;
  const today = dayOf(runMs, timezone);
  const hide = new Set(config?.hide ?? []);
  const states: HeroState[] = [];
  const ids = new Set([...HEROES.map((h) => h.id), ...acc.keys()]);
  for (const id of [...ids].sort()) {
    const hero = HEROES.find((h) => h.id === id) ?? null;
    const a = acc.get(id);
    const mp = Math.floor((a?.milli ?? 0) / 1000);
    const repoCondition = (unlockRepos.get(id) ?? 0) > 0;
    let unlocked = hero !== null && ledger.has(`unlock.hero|${id}`);
    if (hero && !unlocked && mp >= HERO_UNLOCK.minWeightedUsage && repoCondition) {
      ledger.add(
        milestone(`unlock.hero|${id}`, "unlock.hero", `hero:${id}`, 0, today, runAt, rulesVersion, {
          hero: id,
        }),
      );
      ledger.add(
        bp(
          `bp.hero_unlock|${id}`,
          "bp.hero_unlock",
          `hero:${id}`,
          MASTERY_TIERS[0]?.bp ?? 0,
          today,
          runAt,
          rulesVersion,
          { hero: id },
        ),
      );
      unlocked = true;
    }
    if (unlocked && hero) {
      const derived = masteryTierFor(mp);
      for (const tier of MASTERY_TIERS.slice(1)) {
        if (!derived || tier.mp > derived.mp) break;
        const tierId = `mastery|${id}|${tier.id}`;
        if (ledger.has(tierId)) continue;
        ledger.add(
          milestone(tierId, "mastery.tier", `hero:${id}`, 0, today, runAt, rulesVersion, {
            hero: id,
            tier: tier.id,
          }),
        );
        ledger.add(
          bp(
            `bp.mastery|${id}|${tier.id}`,
            "bp.mastery",
            `hero:${id}`,
            tier.bp,
            today,
            runAt,
            rulesVersion,
            { hero: id, tier: tier.id },
          ),
        );
      }
    }
    if (!a && !unlocked) {
      if (hero === null) continue;
      states.push(blank(hero, hide.has(id)));
      continue;
    }
    const history = tierHistory(ledger, id, timezone);
    states.push({
      id,
      kind: hero ? "hero" : "unknown_spirit",
      hero,
      languages: [...(a?.languages ?? [])].sort(),
      state: unlocked ? "unlocked" : (a?.milli ?? 0) > 0 ? "discovered" : "undiscovered",
      mp,
      tier: unlocked ? highestTier(history) : null,
      tierHistory: unlocked ? history : [],
      repos: a?.repos.size ?? 0,
      unlockRepos: unlockRepos.get(id) ?? 0,
      lastActive: a?.lastActive ?? null,
      approximate: a?.approximate ?? false,
      isMain: false,
      hidden: hide.has(id),
    });
  }
  chooseMain(states, config?.main ?? null, diagnostics);
  return states;
}

function blank(hero: HeroDef, hidden: boolean): HeroState {
  return {
    id: hero.id,
    kind: "hero",
    hero,
    languages: [],
    state: "undiscovered",
    mp: 0,
    tier: null,
    tierHistory: [],
    repos: 0,
    unlockRepos: 0,
    lastActive: null,
    approximate: false,
    isMain: false,
    hidden,
  };
}

/** Tier history from the ledger: unlock (Novice) plus each recorded tier. Tiers never go down. */
function tierHistory(ledger: LedgerIndex, id: string, timezone: string): TierRecord[] {
  const out: TierRecord[] = [];
  const day = (e: LedgerEntry | undefined) => {
    const ms = parseInstant(e?.createdAt ?? null);
    return ms === null ? "" : dayOf(ms, timezone);
  };
  const unlock = ledger.get(`unlock.hero|${id}`);
  if (unlock) out.push({ tier: "novice", reachedOn: day(unlock) });
  for (const tier of MASTERY_TIERS.slice(1)) {
    const entry = ledger.get(`mastery|${id}|${tier.id}`);
    if (entry) out.push({ tier: tier.id, reachedOn: day(entry) });
  }
  return out;
}

function highestTier(history: readonly TierRecord[]): MasteryTierId | null {
  return history.at(-1)?.tier ?? null;
}

/** Main hero: the configured one if unlocked, otherwise the unlocked hero with the most MP. */
function chooseMain(
  states: HeroState[],
  configured: string | null,
  diagnostics: Diagnostics,
): void {
  const unlocked = states.filter((s) => s.kind === "hero" && s.state === "unlocked");
  let main = configured ? unlocked.find((s) => s.id === configured) : undefined;
  if (configured && !main) diagnostics.add("main_hero_not_unlocked", configured);
  main ??= [...unlocked].sort((a, b) => b.mp - a.mp || (a.id < b.id ? -1 : 1))[0];
  if (main) main.isMain = true;
}

function milestone(
  id: string,
  rule: string,
  subject: string,
  amount: number,
  day: string,
  runAt: string,
  ruleVersion: string,
  meta: Record<string, string>,
): LedgerEntry {
  return {
    id,
    kind: "unlock",
    rule,
    ruleVersion,
    subject: [subject],
    amount,
    effectiveDay: day,
    createdAt: runAt,
    meta,
  };
}

export function bp(
  id: string,
  rule: string,
  subject: string,
  amount: number,
  day: string,
  runAt: string,
  ruleVersion: string,
  meta: Record<string, string | number>,
): LedgerEntry {
  return {
    id,
    kind: "bp",
    rule,
    ruleVersion,
    subject: [subject],
    amount,
    effectiveDay: day,
    createdAt: runAt,
    meta,
  };
}

export type { MasteryTierDef };
