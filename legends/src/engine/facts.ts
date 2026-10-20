/**
 * Facts index: a read-only, per-day view of VERIFIED activity for quests, campaigns and
 * medals. Everything here comes from the ledger (activity that already passed
 * qualification: bots, spam, duplicates, automation and invalid timestamps removed) or
 * from verified GitHub events. Configuration never adds facts.
 *
 * Days are effective player days (PRD §4.4) unless stated otherwise.
 */
import type { AnyEvent, NormalizedEvent } from "../normalize/event.ts";
import { matchMarkerItems } from "../normalize/markers.ts";
import { eventKeyOf } from "./heroes/attribution.ts";
import { heroForLanguage } from "./heroes/catalog.ts";
import { type Domain, domainWeight } from "./heroes/emblems.ts";
import type { SpecializationResult } from "./heroes/index.ts";
import type { LedgerEntry } from "./ledger.ts";
import type { EngineConfig } from "./qualify.ts";
import { isEstablishedHuman, repoListed } from "./qualify.ts";
import type { Ruleset } from "./rules.ts";
import { dayOf, parseInstant } from "./time.ts";

export interface CommitFact {
  id: string;
  key: string;
  day: string;
  repo: string;
  earned: boolean;
  coAuthored: boolean;
}
export interface PrFact {
  id: string;
  key: string;
  day: string;
  repo: string;
  external: boolean;
  self: boolean;
  commitCount: number;
}
export interface ReviewFact {
  id: string;
  key: string;
  day: string;
  repo: string;
  external: boolean;
  prAuthorId: number | null;
}
export interface IssueFact {
  id: string;
  key: string;
  day: string;
  repo: string;
  external: boolean;
  authorOther: boolean;
}
export interface ReleaseFact {
  id: string;
  key: string;
  day: string;
  repo: string;
  hasNotes: boolean;
  commitsSincePrevious: number;
}
export interface ObjectiveFact {
  id: string;
  day: string;
  type: string;
  contested: boolean;
  counted: boolean;
}
export interface BattleFact {
  day: string;
  score: number;
  victory: boolean;
  mvp: boolean;
  victoryId: string | null;
  mvpId: string | null;
}
export interface RunFact {
  key: string;
  day: string;
  repo: string;
}

export interface Facts {
  commits: CommitFact[];
  prs: PrFact[];
  reviews: ReviewFact[];
  issuesOpened: IssueFact[];
  issuesResolved: IssueFact[];
  releases: ReleaseFact[];
  objectives: ObjectiveFact[];
  battles: Map<string, BattleFact>;
  stars: LedgerEntry[];
  runs: RunFact[];
  /** GitHub contribution calendar (GitHub's own counting; streaks only). */
  calendar: Map<string, number>;
  /** Catalog heroes with ≥ 10% byte share in each repo (latest snapshot). */
  heroesByRepo: Map<string, Set<string>>;
  /** Repo domain weight ≥ threshold, per domain (latest snapshot). */
  domainShare: (repo: string, domain: Domain) => number;
  /** Repos whose latest markers include database migration paths. */
  migrationRepos: Set<string>;
  /** Approving reviews received from established humans on the player's PRs (merged or not). */
  approvalsReceived: Array<{ key: string; day: string }>;
  /** Day each hero was unlocked, each item reached a tier, each emblem level and attunement. */
  unlocks: LedgerEntry[];
  /** Lifetime EXP awarded with an event day before `day`. */
  expBefore: (day: string) => number;
  byDay: <T extends { day: string }>(list: readonly T[]) => Map<string, T[]>;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildFacts(
  ledger: readonly LedgerEntry[],
  events: ReadonlyMap<string, AnyEvent>,
  spec: SpecializationResult,
  config: EngineConfig,
  rules: Ruleset,
): Facts {
  const eventOf = (e: LedgerEntry) => events.get(eventKeyOf(e.subject[0] ?? ""));
  const sorted = [...ledger].sort(
    (a, b) => cmp(a.effectiveDay ?? "", b.effectiveDay ?? "") || cmp(a.id, b.id),
  );
  const repoOf = (e: LedgerEntry) => eventOf(e)?.repo?.id ?? "-";
  const external = (e: LedgerEntry) => {
    const repo = eventOf(e)?.repo;
    return repo !== null && repo !== undefined && !repo.ownedByPlayer;
  };

  const commits: CommitFact[] = [];
  const prs: PrFact[] = [];
  const reviews: ReviewFact[] = [];
  const issuesOpened: IssueFact[] = [];
  const issuesResolved: IssueFact[] = [];
  const releaseEntries: LedgerEntry[] = [];
  const objectives: ObjectiveFact[] = [];
  const stars: LedgerEntry[] = [];
  const unlocks: LedgerEntry[] = [];
  const scores = new Map<string, number>();
  for (const e of sorted) {
    const day = e.effectiveDay ?? "";
    const key = eventKeyOf(e.subject[0] ?? "");
    if (e.kind === "exp" && e.rule !== "exp.private" && day)
      scores.set(day, (scores.get(day) ?? 0) + e.amount);
    switch (e.rule) {
      case "exp.commit": {
        const ev = eventOf(e);
        commits.push({
          id: e.id,
          key,
          day,
          repo: repoOf(e),
          earned: e.amount > 0,
          coAuthored: ev?.type === "commit" && ev.metadata.coAuthorIds.length > 0,
        });
        break;
      }
      case "exp.pr": {
        const ev = eventOf(e);
        prs.push({
          id: e.id,
          key,
          day,
          repo: repoOf(e),
          external: external(e),
          self: e.meta?.self === true,
          commitCount: ev?.type === "pull_request" ? ev.metadata.commitCount : 0,
        });
        break;
      }
      case "exp.review": {
        const ev = eventOf(e);
        reviews.push({
          id: e.id,
          key,
          day,
          repo: repoOf(e),
          external: external(e),
          prAuthorId: ev?.type === "review" ? (ev.metadata.prAuthor?.id ?? null) : null,
        });
        break;
      }
      case "exp.issue_opened":
      case "exp.issue_resolved": {
        const ev = eventOf(e);
        const author = ev?.type === "issue" ? ev.metadata.author : null;
        const fact = {
          id: e.id,
          key,
          day,
          repo: repoOf(e),
          external: external(e),
          authorOther: author !== null && author.kind === "user" && !author.isPlayer,
        };
        (e.rule === "exp.issue_opened" ? issuesOpened : issuesResolved).push(fact);
        break;
      }
      case "exp.release":
        releaseEntries.push(e);
        break;
      default:
        if (e.kind === "trial" && day)
          objectives.push({
            id: e.id,
            day,
            type: e.rule.replace("objective.", ""),
            contested: e.meta?.contested === true,
            counted: e.amount > 0,
          });
        else if (e.kind === "star") stars.push(e);
        else if (e.kind === "unlock") unlocks.push(e);
    }
  }

  const battles = new Map<string, BattleFact>();
  const starIds = new Set(stars.map((e) => e.id));
  for (const [day, score] of scores) {
    if (score <= 0) continue;
    const victoryId = starIds.has(`star.victory|${day}`) ? `star.victory|${day}` : null;
    const mvpId = starIds.has(`star.mvp|${day}`) ? `star.mvp|${day}` : null;
    battles.set(day, {
      day,
      score,
      victory: victoryId !== null,
      mvp: mvpId !== null,
      victoryId,
      mvpId,
    });
  }

  // Releases: notes and "qualifying commits since the previous release" (K4 ③).
  const publishedByRepo = new Map<string, number[]>();
  for (const ev of events.values()) {
    if (ev.type !== "release" || ev.metadata.isDraft || !ev.repo) continue;
    const ms = parseInstant(ev.metadata.publishedAt);
    if (ms !== null)
      publishedByRepo.set(ev.repo.id, [...(publishedByRepo.get(ev.repo.id) ?? []), ms]);
  }
  const commitTimes = new Map<string, number[]>();
  for (const c of commits) {
    const ev = events.get(c.key);
    const ms = parseInstant(ev?.occurredAt ?? null);
    if (ms !== null) commitTimes.set(c.repo, [...(commitTimes.get(c.repo) ?? []), ms]);
  }
  const releases: ReleaseFact[] = releaseEntries.map((e) => {
    const ev = eventOf(e) as NormalizedEvent<"release"> | undefined;
    const repo = repoOf(e);
    const at = Number(e.meta?.publishedMs ?? 0);
    const previous = Math.max(
      -Infinity,
      ...(publishedByRepo.get(repo) ?? []).filter((t) => t < at),
    );
    const since = (commitTimes.get(repo) ?? []).filter((t) => t > previous && t <= at).length;
    return {
      id: e.id,
      key: eventKeyOf(e.subject[0] ?? ""),
      day: e.effectiveDay ?? "",
      repo,
      hasNotes: ev?.metadata.hasNotes ?? false,
      commitsSincePrevious: since,
    };
  });

  const runs: RunFact[] = [];
  const calendar = new Map<string, number>();
  const approvalsReceived: Array<{ key: string; day: string }> = [];
  for (const ev of [...events.values()].sort((a, b) => cmp(a.key, b.key))) {
    if (ev.verification.status === "unverifiable") continue;
    if (ev.type === "workflow_run") {
      const m = ev.metadata;
      const ms = parseInstant(m.createdAt);
      const repo = ev.repo;
      if (
        ms === null ||
        !repo ||
        repo.visibility !== "public" ||
        repo.isFork ||
        !repo.ownedByPlayer ||
        repoListed(repo, config.excludeRepos)
      )
        continue;
      if (
        m.event === "push" &&
        m.conclusion === "success" &&
        m.actorKind === "user" &&
        m.triggeredByPlayer
      )
        runs.push({ key: ev.key, day: dayOf(ms, config.timezone), repo: repo.id });
    } else if (ev.type === "contribution_day") {
      calendar.set(ev.metadata.date, ev.metadata.count);
    } else if (ev.type === "pull_request" && ev.metadata.authorIsPlayer) {
      const ms = parseInstant(ev.metadata.mergedAt ?? ev.metadata.createdAt);
      if (ms === null) continue;
      if (
        ev.metadata.approvers.some((a) =>
          isEstablishedHuman(
            { id: a.id, kind: "user", accountCreatedAt: a.accountCreatedAt },
            ms,
            rules,
          ),
        )
      ) {
        approvalsReceived.push({ key: ev.key, day: dayOf(ms, config.timezone) });
      }
    }
  }

  const heroesByRepo = new Map<string, Set<string>>();
  const domainCache = new Map<string, number>();
  const migrationRepos = new Set<string>();
  for (const facts of spec.attribution.repos.values()) {
    const languages = facts.latestLanguages ?? {};
    const total = Object.values(languages).reduce((s, b) => s + b, 0);
    const heroes = new Set<string>();
    const perHero = new Map<string, number>();
    for (const [language, bytes] of Object.entries(languages)) {
      const hero = heroForLanguage(language);
      if (hero) perHero.set(hero.id, (perHero.get(hero.id) ?? 0) + bytes);
    }
    for (const [hero, bytes] of perHero) if (total > 0 && bytes * 10 >= total) heroes.add(hero);
    heroesByRepo.set(facts.repo.id, heroes);
    const game = matchMarkerItems(facts.markerPaths ?? []).some(
      (i) => i === "unity" || i === "godot",
    );
    for (const d of ["fe", "be", "ai", "ops", "db"] as Domain[]) {
      domainCache.set(
        `${facts.repo.id}|${d}`,
        total > 0 ? Math.floor(domainWeight(languages, d, game) / total) : 0,
      );
    }
    if (matchMarkerItems(facts.markerPaths ?? []).includes("db-migrations"))
      migrationRepos.add(facts.repo.id);
  }

  const expByDay = ledger
    .filter((e) => e.kind === "exp" && e.amount > 0)
    .map((e) => ({ day: e.eventDay ?? e.effectiveDay ?? "", amount: e.amount }))
    .sort((a, b) => cmp(a.day, b.day));

  return {
    commits,
    prs,
    reviews,
    issuesOpened,
    issuesResolved,
    releases,
    objectives,
    battles,
    stars,
    runs,
    calendar,
    heroesByRepo,
    domainShare: (repo, domain) => domainCache.get(`${repo}|${domain}`) ?? 0,
    migrationRepos,
    approvalsReceived: approvalsReceived.sort((a, b) => cmp(a.day, b.day) || cmp(a.key, b.key)),
    unlocks,
    expBefore: (day) => expByDay.filter((x) => x.day < day).reduce((s, x) => s + x.amount, 0),
    byDay: <T extends { day: string }>(list: readonly T[]) => {
      const map = new Map<string, T[]>();
      for (const item of list) map.set(item.day, [...(map.get(item.day) ?? []), item]);
      return map;
    },
  };
}

/** Items in `list` whose day lies in [from, to] (inclusive, string compare on YYYY-MM-DD). */
export function within<T extends { day: string }>(
  list: readonly T[],
  from: string,
  to: string,
): T[] {
  return list.filter((x) => x.day >= from && x.day <= to);
}
