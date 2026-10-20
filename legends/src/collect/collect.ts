import { CollectError, type SafeError, toSafeError } from "../core/errors.ts";
import { type Logger, silentLogger } from "../core/log.ts";
import type { GitHubClient } from "../github/client.ts";
import { restUserSchema } from "../github/schemas.ts";
import { dedupeBatch, preferMoreComplete } from "../normalize/dedupe.ts";
import type { AnyEvent, NormalizedEvent } from "../normalize/event.ts";
import {
  combineIssues,
  combineReviews,
  type NormalizeContext,
  type PlayerIdentity,
} from "../normalize/normalizers.ts";
import { Privacy } from "../normalize/privacy.ts";
import { assertPrivateAuthorization, type CollectionConfig } from "./config.ts";
import { RepoFilter, resolveScope } from "./scope.ts";
import {
  collectCalendar,
  collectClosedIssues,
  collectCommits,
  collectIssues,
  collectLanguages,
  collectPullRequests,
  collectReleases,
  collectReviews,
  collectWorkflowRuns,
} from "./sources.ts";
import { type CollectContext, type SourceReport, skippedReport } from "./types.ts";

export interface CollectInput {
  config: CollectionConfig;
  client: GitHubClient;
  /** The run's single clock reading (UTC ISO-8601). */
  runAt: string;
  /** Required only when config.privateRepos.enabled. Supplied from a secret, never from config. */
  privacySalt?: string | undefined;
  logger?: Logger;
}

export type CollectionStatus = "complete" | "partial" | "failed";

export interface CollectionResult {
  status: CollectionStatus;
  runAt: string;
  coverage: { since: string; until: string };
  player: PlayerIdentity | null;
  /** Fatal error that stopped collection before sources ran (identity or authorization). */
  fatal?: SafeError;
  scope: {
    status: SourceReport["status"];
    repos: number;
    truncatedByLimit: boolean;
    droppedPrivate: number;
    issues: SourceReport["issues"];
  };
  sources: Array<Omit<SourceReport, "events"> & { eventCount: number }>;
  /** Deduplicated, normalised events sorted by key. rev/firstSeenAt are assigned later by mergeObservations. */
  events: AnyEvent[];
  stats: { requests: number; duplicates: number; conflicts: number };
}

export async function fetchPlayer(client: GitHubClient, login: string): Promise<PlayerIdentity> {
  const user = await client.rest("GET /users/{username}", { username: login }, restUserSchema);
  if (user.type !== "User") {
    throw new CollectError("config", "Configured login is not a personal user account");
  }
  return { id: user.id, nodeId: user.node_id, login: user.login, createdAt: user.created_at };
}

export async function collect(input: CollectInput): Promise<CollectionResult> {
  const { config, client, runAt } = input;
  const logger = input.logger ?? silentLogger;
  const since = config.since;
  const base: CollectionResult = {
    status: "failed",
    runAt,
    coverage: { since, until: runAt },
    player: null,
    scope: { status: "skipped", repos: 0, truncatedByLimit: false, droppedPrivate: 0, issues: [] },
    sources: [],
    events: [],
    stats: { requests: 0, duplicates: 0, conflicts: 0 },
  };
  if (Date.parse(since) >= Date.parse(runAt)) {
    return {
      ...base,
      fatal: new CollectError("config", "since must be earlier than runAt").toSafe(),
    };
  }

  let player: PlayerIdentity;
  let privacy: Privacy;
  try {
    assertPrivateAuthorization(config, input.privacySalt);
    privacy = new Privacy({
      playerLogin: config.login,
      privateEnabled: config.privateRepos.enabled,
      salt: input.privacySalt,
      allowPublicNames: config.privateRepos.allowPublicNames,
    });
    player = await fetchPlayer(client, config.login);
  } catch (error) {
    const fatal = toSafeError(error);
    logger.error("collect.fatal", { kind: fatal.kind, status: fatal.status });
    return { ...base, fatal, stats: { ...base.stats, requests: client.requestsMade } };
  }

  const normalize: NormalizeContext = {
    player,
    privacy,
    automationPatterns: config.automationMessagePatterns.map((p) => p.toLowerCase()),
  };
  const filter = new RepoFilter(config);
  const ctx: CollectContext = { client, config, player, normalize, filter, runAt, since, logger };

  const scope = await resolveScope(client, config, privacy, filter, logger);
  const repos = scope.repos;
  const enabled = config.sources;

  // Fixed order: user-level sources first, then per-repo sources.
  const reports: SourceReport[] = [];
  reports.push(enabled.calendar ? await collectCalendar(ctx) : skippedReport("calendar"));
  reports.push(
    enabled.pullRequests ? await collectPullRequests(ctx) : skippedReport("pullRequests"),
  );
  reports.push(enabled.reviews ? await collectReviews(ctx) : skippedReport("reviews"));
  reports.push(enabled.issues ? await collectIssues(ctx) : skippedReport("issues"));
  reports.push(enabled.commits ? await collectCommits(ctx, repos) : skippedReport("commits"));
  reports.push(
    enabled.closedIssues ? await collectClosedIssues(ctx, repos) : skippedReport("closedIssues"),
  );
  reports.push(enabled.releases ? await collectReleases(ctx, repos) : skippedReport("releases"));
  reports.push(enabled.languages ? await collectLanguages(ctx, repos) : skippedReport("languages"));
  reports.push(
    enabled.workflowRuns ? await collectWorkflowRuns(ctx, repos) : skippedReport("workflowRuns"),
  );

  const batch = dedupeBatch(
    reports.flatMap((r) => r.events),
    combineByType,
  );
  const events = batch.events.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  assertPrivacyInvariants(events, config);

  const scopeIncomplete = scope.report.status !== "complete" || scope.truncatedByLimit;
  const anyIncomplete = reports.some((r) => r.status === "partial" || r.status === "failed");
  const status: CollectionStatus = scopeIncomplete || anyIncomplete ? "partial" : "complete";

  for (const r of reports) {
    logger.info("collect.source", {
      source: r.source,
      status: r.status,
      events: r.events.length,
      units: r.unitsTotal,
      unitsComplete: r.unitsComplete,
      truncated: r.truncatedUnits.length,
      failures: r.issues.length,
      droppedPrivate: r.droppedPrivate,
    });
  }

  return {
    ...base,
    status,
    player,
    scope: {
      status: scope.report.status,
      repos: repos.length,
      truncatedByLimit: scope.truncatedByLimit,
      droppedPrivate: scope.report.droppedPrivate,
      issues: scope.report.issues,
    },
    sources: reports.map(({ events: list, ...rest }) => ({ ...rest, eventCount: list.length })),
    events,
    stats: {
      requests: client.requestsMade,
      duplicates: batch.duplicates,
      conflicts: batch.conflicts,
    },
  };
}

function combineByType(a: AnyEvent, b: AnyEvent): AnyEvent {
  if (a.type === "review" && b.type === "review") return combineReviews(a, b);
  if (a.type === "issue" && b.type === "issue") return combineIssues(a, b);
  return preferMoreComplete(a, b);
}

/**
 * Defence in depth: fails the run if any event could expose a private repository
 * beyond what the configuration explicitly allows.
 */
export function assertPrivacyInvariants(
  events: readonly AnyEvent[],
  config: CollectionConfig,
): void {
  const named = new Set(config.privateRepos.allowPublicNames.map((n) => n.toLowerCase()));
  for (const event of events) {
    const repo = event.repo;
    if (repo === null || repo.visibility === "public") continue;
    const violation =
      !config.privateRepos.enabled ||
      !repo.id.startsWith("p:") ||
      (repo.fullName !== undefined && !named.has(repo.fullName.toLowerCase())) ||
      event.actor?.login !== undefined ||
      hasPublicOnlyField(event);
    if (violation) {
      throw new CollectError(
        "not_authorized_private",
        "Private repository data violates the privacy invariants",
      );
    }
  }
}

function hasPublicOnlyField(event: AnyEvent): boolean {
  switch (event.type) {
    case "pull_request":
    case "issue":
      return (event as NormalizedEvent<"pull_request" | "issue">).metadata.number !== undefined;
    case "release":
      return event.metadata.tag !== undefined;
    default:
      return false;
  }
}
