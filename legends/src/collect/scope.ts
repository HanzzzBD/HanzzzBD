import { CollectError } from "../core/errors.ts";
import type { Logger } from "../core/log.ts";
import type { GitHubClient } from "../github/client.ts";
import { CONTRIBUTED_REPOS } from "../github/queries.ts";
import {
  gqlContributedReposSchema,
  restRepoListSchema,
  restRepoSchema,
} from "../github/schemas.ts";
import type { Privacy, RepoFacts } from "../normalize/privacy.ts";
import type { CollectionConfig } from "./config.ts";
import { runUnits, type ScopedRepo, type SourceReport } from "./types.ts";

/**
 * Decides whether records from a repository may be collected. Applied to every source,
 * including user-level contribution queries that can mention repos outside the scope.
 */
export class RepoFilter {
  readonly #config: CollectionConfig;
  readonly #exclude: Set<string>;
  readonly #privateAllow: Set<string>;

  constructor(config: CollectionConfig) {
    this.#config = config;
    this.#exclude = new Set(config.scope.exclude.map((r) => r.toLowerCase()));
    this.#privateAllow = new Set(config.privateRepos.allow.map((r) => r.toLowerCase()));
  }

  verdict(repo: RepoFacts): "allow" | "excluded" | "private_not_allowed" {
    const name = `${repo.owner}/${repo.name}`.toLowerCase();
    if (repo.isPrivate && !(this.#config.privateRepos.enabled && this.#privateAllow.has(name))) {
      return "private_not_allowed";
    }
    if (this.#exclude.has(name)) return "excluded";
    if (repo.isFork && !this.#config.scope.includeForks) return "excluded";
    if (repo.isArchived && !this.#config.scope.includeArchived) return "excluded";
    return "allow";
  }
}

export interface ScopeResult {
  repos: ScopedRepo[];
  report: SourceReport;
  /** True when maxRepos cut the list; the dropped repos are not collected this run. */
  truncatedByLimit: boolean;
}

interface Candidate {
  facts: RepoFacts;
  defaultBranch: string | null;
  pushedAt: string | null;
}

function fromRest(repo: ReturnType<typeof restRepoSchema.parse>): Candidate {
  return {
    facts: {
      databaseId: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      isPrivate: repo.private,
      isFork: repo.fork,
      isArchived: repo.archived,
    },
    defaultBranch: repo.default_branch,
    pushedAt: repo.pushed_at,
  };
}

export async function resolveScope(
  client: GitHubClient,
  config: CollectionConfig,
  privacy: Privacy,
  filter: RepoFilter,
  logger: Logger,
): Promise<ScopeResult> {
  const candidates: Candidate[] = [];
  const maxPages = config.limits.maxPagesPerQuery;
  type Unit = { id: string; run: () => Promise<{ complete: boolean }> };
  const units: Unit[] = [];

  if (config.scope.owned) {
    units.push({
      id: "owned",
      run: async () => {
        // Lists the account's public repositories (this endpoint never returns private ones).
        const page = await client.paginateRest(
          "GET /users/{username}/repos",
          { username: config.login, type: "owner", sort: "pushed", direction: "desc" },
          restRepoListSchema,
          { maxPages },
        );
        for (const item of page.items) candidates.push(fromRest(restRepoSchema.parse(item)));
        return { complete: page.complete };
      },
    });
  }
  if (config.scope.contributed) {
    units.push({
      id: "contributed",
      run: async () => {
        const page = await client.paginateGraphql(async (after) => {
          const data = await client.graphql(
            "LegendsContributedRepos",
            CONTRIBUTED_REPOS,
            { login: config.login, after },
            gqlContributedReposSchema,
          );
          if (data.user === null)
            throw new CollectError("not_found", "User not found", {
              endpoint: "LegendsContributedRepos",
            });
          return data.user.repositoriesContributedTo;
        }, maxPages);
        for (const r of page.items) {
          candidates.push({
            facts: {
              databaseId: r.databaseId,
              owner: r.owner.login,
              name: r.name,
              isPrivate: r.isPrivate,
              isFork: r.isFork,
              isArchived: r.isArchived,
            },
            defaultBranch: r.defaultBranchRef?.name ?? null,
            pushedAt: r.pushedAt,
          });
        }
        return { complete: page.complete };
      },
    });
  }
  const explicit = [
    ...config.scope.include.map((name, i) => ({ name, id: `include#${i}` })),
    ...config.privateRepos.allow.map((name, i) => ({ name, id: `private#${i}` })),
  ];
  for (const { name, id } of explicit) {
    units.push({
      id,
      run: async () => {
        const [owner, repo] = name.split("/") as [string, string];
        try {
          const data = await client.rest(
            "GET /repos/{owner}/{repo}",
            { owner, repo },
            restRepoSchema,
          );
          candidates.push(fromRest(data));
        } catch (error) {
          // For an allow-listed private repo, "not found" means the token is not authorised for it.
          if (
            id.startsWith("private#") &&
            error instanceof CollectError &&
            error.kind === "not_found"
          ) {
            throw new CollectError(
              "not_authorized_private",
              "Allow-listed private repository is not accessible to the token",
              {
                endpoint: "GET /repos/{owner}/{repo}",
              },
            );
          }
          throw error;
        }
        return { complete: true };
      },
    });
  }

  const report = await runUnits(
    "scope",
    units,
    (u) => u.id,
    async (u) => ({ events: [], ...(await u.run()) }),
    logger,
  );

  const seen = new Set<number>();
  const allowed: ScopedRepo[] = [];
  for (const c of candidates) {
    if (seen.has(c.facts.databaseId)) continue;
    seen.add(c.facts.databaseId);
    const verdict = filter.verdict(c.facts);
    if (verdict === "private_not_allowed") report.droppedPrivate++;
    if (verdict !== "allow") continue;
    allowed.push({
      facts: c.facts,
      ref: privacy.repoRef(c.facts),
      defaultBranch: c.defaultBranch,
      pushedAt: c.pushedAt,
    });
  }
  allowed.sort(
    (a, b) =>
      (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "") || a.facts.databaseId - b.facts.databaseId,
  );
  const truncatedByLimit = allowed.length > config.scope.maxRepos;
  return { repos: allowed.slice(0, config.scope.maxRepos), report, truncatedByLimit };
}
