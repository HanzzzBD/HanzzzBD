import { z } from "zod";

/**
 * Response schemas list ONLY the fields the game systems need. Unknown fields are
 * ignored (zod strips them), so extra data GitHub returns is never retained.
 */
const isoDate = z.string().min(10).max(40);
const login = z.string().min(1).max(100);

export const restUserSchema = z.object({
  id: z.number().int().positive(),
  node_id: z.string().min(1).max(100),
  login,
  type: z.string().max(40),
  created_at: isoDate,
});

export const restOwnerSchema = z.object({
  login,
  id: z.number().int().positive(),
  type: z.string().max(40),
});

export const restRepoSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  owner: restOwnerSchema,
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  pushed_at: isoDate.nullable(),
  default_branch: z.string().min(1).max(255),
});
export const restRepoListSchema = z.array(restRepoSchema);

export const restLanguagesSchema = z.record(
  z.string().min(1).max(100),
  z.number().int().nonnegative(),
);

const restActorSchema = z
  .object({ id: z.number().int().positive(), login, type: z.string().max(40) })
  .nullable();

export const restReleaseSchema = z.object({
  id: z.number().int().positive(),
  tag_name: z.string().max(255),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: isoDate.nullable(),
  created_at: isoDate,
  author: restActorSchema,
  body: z.string().nullable().optional(),
});
export const restReleaseListSchema = z.array(restReleaseSchema);

export const restWorkflowRunSchema = z.object({
  id: z.number().int().positive(),
  event: z.string().max(60),
  status: z.string().max(40).nullable(),
  conclusion: z.string().max(40).nullable(),
  created_at: isoDate,
  actor: restActorSchema,
  triggering_actor: restActorSchema.optional(),
});
export const restWorkflowRunPageSchema = z.object({
  total_count: z.number().int().nonnegative(),
  workflow_runs: z.array(restWorkflowRunSchema),
});

// ---------- GraphQL ----------

export const gqlActorSchema = z
  .object({
    __typename: z.string().max(40),
    login,
    databaseId: z.number().int().positive().nullable().optional(),
    createdAt: isoDate.optional(),
  })
  .nullable();

export const gqlRepoSchema = z.object({
  databaseId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  owner: z.object({ login }),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
});

const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().max(500).nullable() });
const connection = <T extends z.ZodType>(node: T) => z.object({ pageInfo, nodes: z.array(node) });

export const gqlContributedReposSchema = z.object({
  user: z
    .object({
      repositoriesContributedTo: connection(
        gqlRepoSchema.extend({
          pushedAt: isoDate.nullable(),
          defaultBranchRef: z.object({ name: z.string().max(255) }).nullable(),
        }),
      ),
    })
    .nullable(),
});

export const gqlCommitNodeSchema = z.object({
  oid: z.string().regex(/^[0-9a-f]{40}$/),
  authoredDate: isoDate,
  committedDate: isoDate,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFilesIfAvailable: z.number().int().nonnegative().nullable(),
  parents: z.object({ totalCount: z.number().int().nonnegative() }),
  message: z.string().max(100_000),
  authors: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(z.object({ user: gqlActorSchema })),
  }),
});

export const gqlCommitHistorySchema = z.object({
  repository: z
    .object({
      defaultBranchRef: z
        .object({
          name: z.string().max(255),
          target: z.object({ history: connection(gqlCommitNodeSchema).optional() }).nullable(),
        })
        .nullable(),
    })
    .nullable(),
});

export const gqlCalendarSchema = z.object({
  user: z
    .object({
      contributionsCollection: z.object({
        restrictedContributionsCount: z.number().int().nonnegative(),
        hasAnyRestrictedContributions: z.boolean(),
        contributionCalendar: z.object({
          weeks: z.array(
            z.object({
              contributionDays: z.array(
                z.object({
                  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                  contributionCount: z.number().int().nonnegative(),
                }),
              ),
            }),
          ),
        }),
      }),
    })
    .nullable(),
});

const prNode = z.object({
  id: z.string().min(1).max(100),
  number: z.number().int().positive(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  merged: z.boolean(),
  mergedAt: isoDate.nullable(),
  createdAt: isoDate,
  author: gqlActorSchema,
  mergedBy: gqlActorSchema,
  repository: gqlRepoSchema,
  commits: z.object({ totalCount: z.number().int().nonnegative() }),
  reviews: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(z.object({ author: gqlActorSchema })),
  }),
});

export const gqlPullRequestContributionsSchema = z.object({
  user: z
    .object({
      contributionsCollection: z.object({
        pullRequestContributions: connection(
          z.object({ occurredAt: isoDate, pullRequest: prNode }),
        ),
      }),
    })
    .nullable(),
});

export const gqlReviewContributionsSchema = z.object({
  user: z
    .object({
      contributionsCollection: z.object({
        pullRequestReviewContributions: connection(
          z.object({
            occurredAt: isoDate,
            pullRequestReview: z.object({
              databaseId: z.number().int().positive(),
              state: z.string().max(40),
              submittedAt: isoDate.nullable(),
              body: z.string().max(200_000),
            }),
            pullRequest: z.object({
              id: z.string().min(1).max(100),
              author: gqlActorSchema,
              repository: gqlRepoSchema,
            }),
          }),
        ),
      }),
    })
    .nullable(),
});

const issueNode = z.object({
  id: z.string().min(1).max(100),
  number: z.number().int().positive(),
  state: z.enum(["OPEN", "CLOSED"]),
  stateReason: z.string().max(40).nullable(),
  createdAt: isoDate,
  closedAt: isoDate.nullable(),
  author: gqlActorSchema,
});

export const gqlIssueContributionsSchema = z.object({
  user: z
    .object({
      contributionsCollection: z.object({
        issueContributions: connection(
          z.object({ occurredAt: isoDate, issue: issueNode.extend({ repository: gqlRepoSchema }) }),
        ),
      }),
    })
    .nullable(),
});

export const gqlClosedIssuesSchema = z.object({
  repository: z
    .object({
      issues: connection(
        issueNode.extend({
          timelineItems: z.object({
            nodes: z.array(z.object({ actor: gqlActorSchema.optional() }).nullable()),
          }),
        }),
      ),
    })
    .nullable(),
});

export type GqlActor = z.output<typeof gqlActorSchema>;
export type GqlRepo = z.output<typeof gqlRepoSchema>;
export type GqlCommitNode = z.output<typeof gqlCommitNodeSchema>;
export type RestRepo = z.output<typeof restRepoSchema>;
