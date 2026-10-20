import { CollectError } from "../core/errors.ts";
import {
  CALENDAR,
  CLOSED_ISSUES,
  COMMIT_HISTORY,
  ISSUE_CONTRIBUTIONS,
  PULL_REQUEST_CONTRIBUTIONS,
  REVIEW_CONTRIBUTIONS,
} from "../github/queries.ts";
import {
  type GqlRepo,
  gqlCalendarSchema,
  gqlClosedIssuesSchema,
  gqlCommitHistorySchema,
  gqlIssueContributionsSchema,
  gqlPullRequestContributionsSchema,
  gqlReviewContributionsSchema,
  restLanguagesSchema,
  restReleaseListSchema,
  restReleaseSchema,
  restWorkflowRunPageSchema,
  restWorkflowRunSchema,
} from "../github/schemas.ts";
import type { AnyEvent, RepoRef } from "../normalize/event.ts";
import {
  normalizeCommit,
  normalizeContributionDay,
  normalizeIssue,
  normalizePrivateCount,
  normalizePullRequest,
  normalizeRelease,
  normalizeRepoSnapshot,
  normalizeReview,
  normalizeWorkflowRun,
} from "../normalize/normalizers.ts";
import type { RepoFacts } from "../normalize/privacy.ts";
import {
  type CollectContext,
  runUnits,
  type ScopedRepo,
  type SourceReport,
  yearWindows,
} from "./types.ts";

const windowId = (w: { from: string; to: string }) =>
  `window:${w.from.slice(0, 10)}..${w.to.slice(0, 10)}`;

function factsOf(repo: GqlRepo): RepoFacts {
  return {
    databaseId: repo.databaseId,
    owner: repo.owner.login,
    name: repo.name,
    isPrivate: repo.isPrivate,
    isFork: repo.isFork,
    isArchived: repo.isArchived,
  };
}

/** Applies the repo filter to records found through user-level queries. */
function admit(ctx: CollectContext, repo: GqlRepo): RepoRef | "private" | null {
  const facts = factsOf(repo);
  const verdict = ctx.filter.verdict(facts);
  if (verdict === "private_not_allowed") return "private";
  if (verdict === "excluded") return null;
  return ctx.normalize.privacy.repoRef(facts);
}

function userOrThrow<T>(user: T | null, endpoint: string): T {
  if (user === null) throw new CollectError("not_found", "User not found", { endpoint });
  return user;
}

// ---------------------------------------------------------------- calendar + private count

/**
 * Contribution calendar days and the private contribution count. The calendar reflects
 * GitHub's own counting rules (default branch, linked email, non-fork); it is NOT a
 * list of commits and is used for streaks only.
 */
export function collectCalendar(ctx: CollectContext): Promise<SourceReport> {
  const windows = yearWindows(ctx.since, ctx.runAt);
  return runUnits(
    "calendar",
    windows,
    windowId,
    async (w) => {
      const data = await ctx.client.graphql(
        "LegendsCalendar",
        CALENDAR,
        { login: ctx.player.login, from: w.from, to: w.to },
        gqlCalendarSchema,
      );
      const cc = userOrThrow(data.user, "LegendsCalendar").contributionsCollection;
      const events: AnyEvent[] = [];
      for (const week of cc.contributionCalendar.weeks) {
        for (const day of week.contributionDays) {
          events.push(normalizeContributionDay(day.date, day.contributionCount, ctx.normalize));
        }
      }
      events.push(
        normalizePrivateCount(w.from, w.to, cc.restrictedContributionsCount, ctx.normalize),
      );
      return { events, complete: true };
    },
    ctx.logger,
  );
}

// ---------------------------------------------------------------- commits

/**
 * Default-branch commits authored by the player, per repo, since `ctx.since`.
 * Limitation: the history `author` filter matches the commit author; commits where the
 * player is only a co-author are not returned.
 */
export function collectCommits(
  ctx: CollectContext,
  repos: readonly ScopedRepo[],
): Promise<SourceReport> {
  const targets = repos.filter((r) => r.defaultBranch !== null);
  return runUnits(
    "commits",
    targets,
    (r) => r.ref.id,
    async (repo) => {
      const page = await ctx.client.paginateGraphql(async (after) => {
        const data = await ctx.client.graphql(
          "LegendsCommitHistory",
          COMMIT_HISTORY,
          {
            owner: repo.facts.owner,
            name: repo.facts.name,
            authorId: ctx.player.nodeId,
            since: ctx.since,
            after,
          },
          gqlCommitHistorySchema,
        );
        if (data.repository === null) {
          throw new CollectError("not_found", "Repository not accessible", {
            endpoint: "LegendsCommitHistory",
          });
        }
        const history = data.repository.defaultBranchRef?.target?.history;
        return history ?? { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
      }, ctx.config.limits.maxPagesPerQuery);
      return {
        events: page.items.map((n) => normalizeCommit(n, repo.ref, ctx.normalize)),
        complete: page.complete,
      };
    },
    ctx.logger,
  );
}

// ---------------------------------------------------------------- pull requests

export function collectPullRequests(ctx: CollectContext): Promise<SourceReport> {
  const windows = yearWindows(ctx.since, ctx.runAt);
  return runUnits(
    "pullRequests",
    windows,
    windowId,
    async (w) => {
      let dropped = 0;
      const page = await ctx.client.paginateGraphql(async (after) => {
        const data = await ctx.client.graphql(
          "LegendsPullRequests",
          PULL_REQUEST_CONTRIBUTIONS,
          { login: ctx.player.login, from: w.from, to: w.to, after },
          gqlPullRequestContributionsSchema,
        );
        return userOrThrow(data.user, "LegendsPullRequests").contributionsCollection
          .pullRequestContributions;
      }, ctx.config.limits.maxPagesPerQuery);
      const events: AnyEvent[] = [];
      for (const node of page.items) {
        const repo = admit(ctx, node.pullRequest.repository);
        if (repo === "private") dropped++;
        if (repo === null || repo === "private") continue;
        events.push(normalizePullRequest(node.pullRequest, repo, ctx.normalize));
      }
      return { events, complete: page.complete, droppedPrivate: dropped };
    },
    ctx.logger,
  );
}

// ---------------------------------------------------------------- reviews

export function collectReviews(ctx: CollectContext): Promise<SourceReport> {
  const windows = yearWindows(ctx.since, ctx.runAt);
  return runUnits(
    "reviews",
    windows,
    windowId,
    async (w) => {
      let dropped = 0;
      const page = await ctx.client.paginateGraphql(async (after) => {
        const data = await ctx.client.graphql(
          "LegendsReviews",
          REVIEW_CONTRIBUTIONS,
          { login: ctx.player.login, from: w.from, to: w.to, after },
          gqlReviewContributionsSchema,
        );
        return userOrThrow(data.user, "LegendsReviews").contributionsCollection
          .pullRequestReviewContributions;
      }, ctx.config.limits.maxPagesPerQuery);
      const events: AnyEvent[] = [];
      for (const node of page.items) {
        const repo = admit(ctx, node.pullRequest.repository);
        if (repo === "private") dropped++;
        if (repo === null || repo === "private") continue;
        events.push(
          normalizeReview(
            {
              databaseId: node.pullRequestReview.databaseId,
              state: node.pullRequestReview.state,
              submittedAt: node.pullRequestReview.submittedAt,
              body: node.pullRequestReview.body,
              prNodeId: node.pullRequest.id,
              prAuthor: node.pullRequest.author,
              occurredAt: node.occurredAt,
            },
            repo,
            ctx.normalize,
          ),
        );
      }
      return { events, complete: page.complete, droppedPrivate: dropped };
    },
    ctx.logger,
  );
}

// ---------------------------------------------------------------- issues opened by the player

export function collectIssues(ctx: CollectContext): Promise<SourceReport> {
  const windows = yearWindows(ctx.since, ctx.runAt);
  return runUnits(
    "issues",
    windows,
    windowId,
    async (w) => {
      let dropped = 0;
      const page = await ctx.client.paginateGraphql(async (after) => {
        const data = await ctx.client.graphql(
          "LegendsIssues",
          ISSUE_CONTRIBUTIONS,
          { login: ctx.player.login, from: w.from, to: w.to, after },
          gqlIssueContributionsSchema,
        );
        return userOrThrow(data.user, "LegendsIssues").contributionsCollection.issueContributions;
      }, ctx.config.limits.maxPagesPerQuery);
      const events: AnyEvent[] = [];
      for (const node of page.items) {
        const repo = admit(ctx, node.issue.repository);
        if (repo === "private") dropped++;
        if (repo === null || repo === "private") continue;
        events.push(normalizeIssue(node.issue, repo, ctx.normalize, "issues"));
      }
      return { events, complete: page.complete, droppedPrivate: dropped };
    },
    ctx.logger,
  );
}

// ---------------------------------------------------------------- issues closed in owned repos

/** Closed issues (by anyone) in the player's own repos, with the closer: needed for "community fix". */
export function collectClosedIssues(
  ctx: CollectContext,
  repos: readonly ScopedRepo[],
): Promise<SourceReport> {
  const owned = repos.filter((r) => r.ref.ownedByPlayer);
  return runUnits(
    "closedIssues",
    owned,
    (r) => r.ref.id,
    async (repo) => {
      const page = await ctx.client.paginateGraphql(async (after) => {
        const data = await ctx.client.graphql(
          "LegendsClosedIssues",
          CLOSED_ISSUES,
          { owner: repo.facts.owner, name: repo.facts.name, since: ctx.since, after },
          gqlClosedIssuesSchema,
        );
        if (data.repository === null) {
          throw new CollectError("not_found", "Repository not accessible", {
            endpoint: "LegendsClosedIssues",
          });
        }
        return data.repository.issues;
      }, ctx.config.limits.maxPagesPerQuery);
      const events = page.items.map((issue) => {
        const closedEvent = issue.timelineItems.nodes[0];
        return normalizeIssue(
          { ...issue, closedBy: closedEvent ? (closedEvent.actor ?? null) : undefined },
          repo.ref,
          ctx.normalize,
          "closedIssues",
        );
      });
      return { events, complete: page.complete };
    },
    ctx.logger,
  );
}

// ---------------------------------------------------------------- releases

export function collectReleases(
  ctx: CollectContext,
  repos: readonly ScopedRepo[],
): Promise<SourceReport> {
  const owned = repos.filter((r) => r.ref.ownedByPlayer);
  return runUnits(
    "releases",
    owned,
    (r) => r.ref.id,
    async (repo) => {
      const page = await ctx.client.paginateRest(
        "GET /repos/{owner}/{repo}/releases",
        { owner: repo.facts.owner, repo: repo.facts.name },
        restReleaseListSchema,
        { maxPages: ctx.config.limits.maxPagesPerQuery },
      );
      const events = page.items
        .map((item) => restReleaseSchema.parse(item))
        .filter((r) => (r.published_at ?? r.created_at) >= ctx.since)
        .map((r) => normalizeRelease(r, repo.ref, ctx.normalize));
      return { events, complete: page.complete };
    },
    ctx.logger,
  );
}

// ---------------------------------------------------------------- languages

export function collectLanguages(
  ctx: CollectContext,
  repos: readonly ScopedRepo[],
): Promise<SourceReport> {
  const observedOn = ctx.runAt.slice(0, 10);
  const targets = repos.filter(
    (r) => r.ref.visibility === "public" || ctx.config.privateRepos.includeLanguages,
  );
  return runUnits(
    "languages",
    targets,
    (r) => r.ref.id,
    async (repo) => {
      const languages = await ctx.client.rest(
        "GET /repos/{owner}/{repo}/languages",
        { owner: repo.facts.owner, repo: repo.facts.name },
        restLanguagesSchema,
      );
      return {
        events: [normalizeRepoSnapshot(languages, repo.pushedAt, observedOn, repo.ref)],
        complete: true,
      };
    },
    ctx.logger,
  );
}

// ---------------------------------------------------------------- workflow runs (P1)

export function collectWorkflowRuns(
  ctx: CollectContext,
  repos: readonly ScopedRepo[],
): Promise<SourceReport> {
  const owned = repos.filter((r) => r.ref.ownedByPlayer);
  return runUnits(
    "workflowRuns",
    owned,
    (r) => r.ref.id,
    async (repo) => {
      const page = await ctx.client.paginateRest(
        "GET /repos/{owner}/{repo}/actions/runs",
        {
          owner: repo.facts.owner,
          repo: repo.facts.name,
          event: "push",
          status: "success",
          created: `>=${ctx.since.slice(0, 10)}`,
        },
        restWorkflowRunPageSchema,
        { maxPages: ctx.config.limits.maxPagesPerQuery, selectItems: (p) => p.workflow_runs },
      );
      const events = page.items.map((item) =>
        normalizeWorkflowRun(restWorkflowRunSchema.parse(item), repo.ref, ctx.normalize),
      );
      return { events, complete: page.complete };
    },
    ctx.logger,
  );
}
