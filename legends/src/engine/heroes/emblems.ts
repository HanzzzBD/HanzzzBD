/**
 * Domain emblems (GDD §D, PD-19; progression-tables §5).
 *
 * Emblem Points (EP) come from verified, already-qualified activity only. Language weights
 * route commit EXP into domains; emblems describe where the player's verified activity went,
 * not how skilled they are.
 */
import type { AnyEvent } from "../../normalize/event.ts";
import { matchMarkerItems } from "../../normalize/markers.ts";
import type { LedgerEntry, LedgerIndex } from "../ledger.ts";
import type { Diagnostics, EngineConfig } from "../qualify.ts";
import { addDays, dayOf, parseInstant } from "../time.ts";
import { type Attribution, type CommitCredit, creditableRepo, eventKeyOf } from "./attribution.ts";
import { bp } from "./mastery.ts";

export type EmblemId =
  | "frontend"
  | "backend"
  | "fullstack"
  | "ai_ml"
  | "devops"
  | "database"
  | "open_source";
export type Domain = "fe" | "be" | "ai" | "ops" | "db";

export interface EmblemDef {
  id: EmblemId;
  name: string;
  domain: string;
  glyph: string;
  /** Matching activity BP bonus when active (percent). */
  bonusPercent: number;
}

export const EMBLEMS: readonly EmblemDef[] = [
  { id: "frontend", name: "Frontend", domain: "UI and client", glyph: "lantern", bonusPercent: 15 },
  {
    id: "backend",
    name: "Backend",
    domain: "Server and application logic",
    glyph: "anvil",
    bonusPercent: 15,
  },
  { id: "fullstack", name: "Full-stack", domain: "Both ends", glyph: "bridge", bonusPercent: 8 },
  {
    id: "ai_ml",
    name: "AI/ML",
    domain: "Data science and machine learning",
    glyph: "telescope",
    bonusPercent: 15,
  },
  {
    id: "devops",
    name: "DevOps",
    domain: "Infrastructure, CI/CD, operations",
    glyph: "anchor",
    bonusPercent: 15,
  },
  {
    id: "database",
    name: "Database",
    domain: "Schemas, queries, data stores",
    glyph: "vault",
    bonusPercent: 15,
  },
  {
    id: "open_source",
    name: "Open Source",
    domain: "Collaboration beyond one's own repos",
    glyph: "gate",
    bonusPercent: 15,
  },
];

/** Cumulative EP per level 1–10 (progression-tables §5). */
export const EMBLEM_LEVELS: readonly number[] = [
  100, 400, 1_000, 2_000, 3_500, 5_500, 8_000, 11_000, 15_000, 20_000,
];
export const EMBLEM_LEVEL_BP_PER_LEVEL = 20;
export const EMBLEM_SWITCH_COOLDOWN_DAYS = 7;
export const DEVOPS_RUN_DAY_EP = 5;
export const OPEN_SOURCE_ISSUE_EP = 15;

/** Language → domain weights in percent (GDD §D.2). Languages not listed feed no domain. */
export const DOMAIN_WEIGHTS: Readonly<Record<string, Partial<Record<Domain, number>>>> = {
  HTML: { fe: 100 },
  CSS: { fe: 100 },
  SCSS: { fe: 100 },
  Vue: { fe: 100 },
  Svelte: { fe: 100 },
  TypeScript: { fe: 60, be: 40 },
  JavaScript: { fe: 60, be: 40 },
  Blade: { fe: 50, be: 50 },
  PHP: { be: 100 },
  Java: { be: 100 },
  Go: { be: 100 },
  Kotlin: { be: 100 },
  Ruby: { be: 100 },
  Elixir: { be: 100 },
  "C#": { be: 100 },
  Python: { be: 50, ai: 50 },
  "Jupyter Notebook": { ai: 100 },
  R: { ai: 100 },
  Shell: { ops: 100 },
  Dockerfile: { ops: 100 },
  HCL: { ops: 100 },
  Nix: { ops: 100 },
  PowerShell: { ops: 100 },
  Makefile: { ops: 100 },
  SQL: { db: 100 },
  PLpgSQL: { db: 100 },
  PLSQL: { db: 100 },
  TSQL: { db: 100 },
  Rust: { be: 50 },
  C: { be: 50 },
  "C++": { be: 50 },
};
/** In game projects (Unity/Godot marker) these languages feed no domain (GDD §D.2 footnote). */
const GAME_LANGUAGES = new Set(["C#", "ShaderLab", "HLSL", "GDScript"]);
const DOMAIN_OF: Partial<Record<EmblemId, Domain>> = {
  frontend: "fe",
  backend: "be",
  ai_ml: "ai",
  devops: "ops",
  database: "db",
};

export interface EmblemState {
  id: EmblemId;
  def: EmblemDef;
  ep: number;
  level: number;
  /** EP needed for the next level (null at level 10). */
  nextLevelEp: number | null;
  owned: boolean;
  attuned: boolean;
  active: boolean;
  suggested: boolean;
  /** Contributions by source, in EP (for transparency). */
  sources: Record<string, number>;
}

export interface EmblemResult {
  emblems: EmblemState[];
  active: EmblemId | null;
  /** Day from which the active emblem can be changed again. */
  changeableFrom: string | null;
  /** BP bonus percent for an EXP ledger entry (0 when no active emblem matches). */
  bonusPercent: (expEntry: LedgerEntry) => number;
}

/** Domain weight of a snapshot in "percent × bytes"; game languages excluded in game projects. */
export function domainWeight(
  languages: Readonly<Record<string, number>>,
  domain: Domain,
  gameProject: boolean,
): number {
  let sum = 0;
  for (const [language, bytes] of Object.entries(languages)) {
    if (gameProject && GAME_LANGUAGES.has(language)) continue;
    sum += bytes * (DOMAIN_WEIGHTS[language]?.[domain] ?? 0);
  }
  return sum;
}

export function emblemLevelFor(ep: number): number {
  let level = 0;
  for (const threshold of EMBLEM_LEVELS) if (ep >= threshold) level++;
  return level;
}

export interface EmblemConfig {
  active?: string | null;
}

export function evaluateEmblems(
  attribution: Attribution,
  events: ReadonlyMap<string, AnyEvent>,
  ledger: LedgerIndex,
  engineConfig: EngineConfig,
  emblemConfig: EmblemConfig | undefined,
  rulesVersion: string,
  runAt: string,
  diagnostics: Diagnostics,
): EmblemResult {
  const timezone = engineConfig.timezone;
  const gameRepos = new Set<string>();
  for (const facts of attribution.repos.values()) {
    const items = matchMarkerItems(facts.markerPaths ?? []);
    if (items.includes("unity") || items.includes("godot")) gameRepos.add(facts.repo.id);
  }

  // Commit EP per domain (milli), weighting each award by its own snapshot.
  const milli: Record<Domain, number> = { fe: 0, be: 0, ai: 0, ops: 0, db: 0 };
  const creditById = new Map<string, CommitCredit>();
  for (const credit of attribution.credits) {
    creditById.set(credit.entryId, credit);
    if (!credit.languages) continue;
    for (const domain of Object.keys(milli) as Domain[]) {
      const w = domainWeight(credit.languages, domain, gameRepos.has(credit.repo.id));
      // exp × (w / 100 / total) × 1000 = exp × w × 10 / total
      if (w > 0) milli[domain] += Math.floor((credit.exp * w * 10) / credit.totalBytes);
    }
  }

  // DevOps: +5 EP per player day with ≥ 1 successful, player-triggered push run in an owned repo.
  const runDays = new Set<string>();
  // Open Source: EXP from merges and reviews in repos the player does not own, + 15 EP per external issue resolved.
  let openSourceMilli = 0;
  let externalIssues = 0;
  for (const event of [...events.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    if (event.type === "workflow_run") {
      const m = event.metadata;
      const ms = parseInstant(m.createdAt);
      if (ms === null || !creditableRepo(event.repo, engineConfig) || !event.repo.ownedByPlayer)
        continue;
      if (
        m.event === "push" &&
        m.conclusion === "success" &&
        m.actorKind === "user" &&
        m.triggeredByPlayer
      )
        runDays.add(dayOf(ms, timezone));
    } else if (event.type === "issue") {
      const m = event.metadata;
      if (
        creditableRepo(event.repo, engineConfig) &&
        !event.repo.ownedByPlayer &&
        m.author?.isPlayer &&
        m.state === "CLOSED" &&
        m.stateReason?.toUpperCase() === "COMPLETED"
      )
        externalIssues++;
    }
  }
  for (const entry of ledger.entries) {
    if (entry.rule !== "exp.pr" && entry.rule !== "exp.review") continue;
    const repo = events.get(eventKeyOf(entry.subject[0] ?? ""))?.repo ?? null;
    if (creditableRepo(repo, engineConfig) && !repo.ownedByPlayer)
      openSourceMilli += entry.amount * 1000;
  }

  const ep: Record<EmblemId, number> = {
    frontend: Math.floor(milli.fe / 1000),
    backend: Math.floor(milli.be / 1000),
    fullstack: 2 * Math.floor(Math.min(milli.fe, milli.be) / 1000),
    ai_ml: Math.floor(milli.ai / 1000),
    devops: Math.floor(milli.ops / 1000) + runDays.size * DEVOPS_RUN_DAY_EP,
    database: Math.floor(milli.db / 1000),
    open_source: Math.floor(openSourceMilli / 1000) + externalIssues * OPEN_SOURCE_ISSUE_EP,
  };
  const sources: Record<EmblemId, Record<string, number>> = {
    frontend: { commits: ep.frontend },
    backend: { commits: ep.backend },
    fullstack: { balance: ep.fullstack },
    ai_ml: { commits: ep.ai_ml },
    devops: {
      commits: Math.floor(milli.ops / 1000),
      workflowRunDays: runDays.size * DEVOPS_RUN_DAY_EP,
    },
    database: { commits: ep.database },
    open_source: {
      mergesAndReviews: Math.floor(openSourceMilli / 1000),
      externalIssues: externalIssues * OPEN_SOURCE_ISSUE_EP,
    },
  };

  const runMs = parseInstant(runAt) ?? 0;
  const today = dayOf(runMs, timezone);
  // Levels and level-up BP (milestones; levels never go down).
  for (const def of EMBLEMS) {
    const derived = emblemLevelFor(ep[def.id]);
    for (let n = 1; n <= derived; n++) {
      const id = `emblem.level|${def.id}|${n}`;
      if (ledger.has(id)) continue;
      ledger.add({
        id,
        kind: "unlock",
        rule: "emblem.level",
        ruleVersion: rulesVersion,
        subject: [`emblem:${def.id}`],
        amount: 0,
        effectiveDay: today,
        createdAt: runAt,
        meta: { emblem: def.id, level: n },
      });
      ledger.add(
        bp(
          `bp.emblem_level|${def.id}|${n}`,
          "bp.emblem_level",
          `emblem:${def.id}`,
          EMBLEM_LEVEL_BP_PER_LEVEL * n,
          today,
          runAt,
          rulesVersion,
          { emblem: def.id, level: n },
        ),
      );
    }
  }
  const recordedLevel = (id: EmblemId) => {
    let level = 0;
    for (let n = 1; n <= EMBLEM_LEVELS.length; n++)
      if (ledger.has(`emblem.level|${id}|${n}`)) level = n;
    return level;
  };

  // Activation (config choice) with a free first attunement and a 7-day switch cooldown.
  const activations = ledger.entries
    .filter((e) => e.rule === "emblem.activate")
    .sort((a, b) => ((a.effectiveDay ?? "") < (b.effectiveDay ?? "") ? -1 : 1));
  const last = activations.at(-1);
  const current = (last?.meta?.emblem as EmblemId | "none" | undefined) ?? "none";
  const changeableFrom = last?.effectiveDay
    ? addDays(last.effectiveDay, EMBLEM_SWITCH_COOLDOWN_DAYS)
    : null;
  const attuned = () =>
    new Set(
      ledger.entries
        .filter((e) => e.rule === "emblem.attune")
        .map((e) => e.meta?.emblem as EmblemId),
    );
  const requested = emblemConfig?.active ?? null;
  const wanted: EmblemId | "none" =
    requested === null ? "none" : (EMBLEMS.find((e) => e.id === requested)?.id ?? "none");
  if (requested !== null && wanted === "none") diagnostics.add("unknown_emblem", String(requested));
  if (wanted !== current && !(requested !== null && wanted === "none")) {
    let allowed = true;
    if (changeableFrom !== null && today < changeableFrom) {
      allowed = false;
      diagnostics.add("emblem_cooldown", wanted);
    } else if (wanted !== "none") {
      if (recordedLevel(wanted) < 1) {
        allowed = false;
        diagnostics.add("emblem_not_owned", wanted);
      } else if (!attuned().has(wanted)) {
        if (attuned().size === 0) {
          ledger.add({
            id: `emblem.attune|${wanted}`,
            kind: "unlock",
            rule: "emblem.attune",
            ruleVersion: rulesVersion,
            subject: [`emblem:${wanted}`],
            amount: 0,
            effectiveDay: today,
            createdAt: runAt,
            meta: { emblem: wanted, cost: 0 },
          });
        } else {
          // Further attunements cost 500 BP through the shop (not implemented yet).
          allowed = false;
          diagnostics.add("emblem_not_attuned", wanted);
        }
      }
    }
    if (allowed && (last === undefined || last.effectiveDay !== today)) {
      ledger.add({
        id: `emblem.activate|${today}`,
        kind: "unlock",
        rule: "emblem.activate",
        ruleVersion: rulesVersion,
        subject: [today],
        amount: 0,
        effectiveDay: today,
        createdAt: runAt,
        meta: { emblem: wanted },
      });
    }
  }

  const history = ledger.entries
    .filter((e) => e.rule === "emblem.activate")
    .map((e) => ({ day: e.effectiveDay ?? "", emblem: e.meta?.emblem as EmblemId | "none" }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  const activeOn = (day: string): EmblemId | null => {
    let active: EmblemId | "none" = "none";
    for (const h of history) if (h.day <= day) active = h.emblem;
    return active === "none" ? null : active;
  };
  const activeNow = activeOn(today);
  const lastNow = history.at(-1);

  const bonusPercent = (entry: LedgerEntry): number => {
    if (entry.kind !== "exp" || !entry.effectiveDay) return 0;
    const active = activeOn(entry.effectiveDay);
    if (!active) return 0;
    const def = EMBLEMS.find((e) => e.id === active);
    if (!def) return 0;
    if (active === "fullstack") return entry.rule === "exp.commit" ? def.bonusPercent : 0;
    if (active === "open_source") {
      if (entry.rule !== "exp.pr" && entry.rule !== "exp.review") return 0;
      const repo = events.get(eventKeyOf(entry.subject[0] ?? ""))?.repo ?? null;
      return creditableRepo(repo, engineConfig) && !repo.ownedByPlayer ? def.bonusPercent : 0;
    }
    const domain = DOMAIN_OF[active];
    const credit = creditById.get(entry.id);
    if (!domain || entry.rule !== "exp.commit" || !credit?.languages) return 0;
    // Matching: the repo's domain weight is ≥ 0.5 → Σ(bytes × weight%) ≥ 50 × totalBytes.
    return domainWeight(credit.languages, domain, gameRepos.has(credit.repo.id)) >=
      50 * credit.totalBytes
      ? def.bonusPercent
      : 0;
  };

  const attunedNow = attuned();
  const top = Math.max(...EMBLEMS.map((e) => ep[e.id]));
  const emblems = EMBLEMS.map((def): EmblemState => {
    const level = Math.max(emblemLevelFor(ep[def.id]), recordedLevel(def.id));
    return {
      id: def.id,
      def,
      ep: ep[def.id],
      level,
      nextLevelEp: EMBLEM_LEVELS[level] ?? null,
      owned: level >= 1,
      attuned: attunedNow.has(def.id),
      active: activeNow === def.id,
      suggested:
        top > 0 && ep[def.id] === top && EMBLEMS.find((e) => ep[e.id] === top)?.id === def.id,
      sources: sources[def.id],
    };
  });
  return {
    emblems,
    active: activeNow,
    changeableFrom: lastNow ? addDays(lastNow.day, EMBLEM_SWITCH_COOLDOWN_DAYS) : null,
    bonusPercent,
  };
}
