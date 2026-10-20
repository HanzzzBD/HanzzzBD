import type { z } from "zod";
import { canonicalJson } from "../core/hash.ts";
import type {
  GqlActor,
  GqlCommitNode,
  restLanguagesSchema,
  restReleaseSchema,
  restWorkflowRunSchema,
} from "../github/schemas.ts";
import {
  type ActorKind,
  type ActorRef,
  COLLECTOR_VERSION,
  type NormalizedEvent,
  type RepoRef,
  type SourceId,
  type Verification,
} from "./event.ts";
import type { Privacy } from "./privacy.ts";

export interface PlayerIdentity {
  id: number;
  nodeId: string;
  login: string;
  createdAt: string;
}

export interface NormalizeContext {
  player: PlayerIdentity;
  privacy: Privacy;
  /** Lower-cased literal substrings (GDD §1.6). */
  automationPatterns: readonly string[];
}

const UNSET = "1970-01-01T00:00:00Z"; // placeholder until mergeObservations assigns firstSeenAt

function provenance(source: SourceId, api: "rest" | "graphql") {
  return { sources: [source], api, collectorVersion: COLLECTOR_VERSION };
}

function verification(notes: string[]): Verification {
  return { status: notes.length === 0 ? "verified" : "partial", notes: [...notes].sort() };
}

export function actorKindOf(typename: string, login: string): ActorKind {
  if (typename === "Bot" || login.endsWith("[bot]")) return "bot";
  if (typename === "Organization") return "organization";
  if (typename === "User") return "user";
  return "unknown";
}

/**
 * Minimal actor reference. Logins are kept only for human, non-player actors on public
 * repositories (needed to show allies); nothing else about other people is stored.
 */
export function actorRef(
  actor: GqlActor,
  ctx: NormalizeContext,
  repo: RepoRef | null,
): ActorRef | null {
  if (actor === null) return null;
  const kind = actorKindOf(actor.__typename, actor.login);
  const id = actor.databaseId ?? null;
  const isPlayer = id !== null && id === ctx.player.id;
  const ref: ActorRef = { id, kind, isPlayer };
  if (kind === "user" && !isPlayer && repo?.visibility !== "private") ref.login = actor.login;
  if (actor.createdAt !== undefined) ref.accountCreatedAt = actor.createdAt;
  return ref;
}

const TRAILER = /^(co-authored-by|signed-off-by|reviewed-by|change-id):.*$/gim;

/** Message normalisation for fingerprints: trailers removed, whitespace collapsed, lower-cased. */
export function normalizeMessage(message: string): string {
  return message.replace(TRAILER, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeCommit(
  node: GqlCommitNode,
  repo: RepoRef,
  ctx: NormalizeContext,
): NormalizedEvent<"commit"> {
  const notes: string[] = [];
  const authors = node.authors.nodes.map((n) => n.user);
  const primary = authors[0] ?? null;
  if (node.authors.totalCount > authors.length) notes.push("co_authors_truncated");
  if (node.changedFilesIfAvailable === null) notes.push("changed_files_unavailable");
  if (primary === null) notes.push("primary_author_unlinked");

  const coAuthorIds = authors
    .slice(1)
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .filter((a) => actorKindOf(a.__typename, a.login) === "user")
    .map((a) => a.databaseId)
    .filter((id): id is number => typeof id === "number" && id !== ctx.player.id)
    .sort((a, b) => a - b);

  const lowered = node.message.toLowerCase();
  const messagePatternHit = ctx.automationPatterns.some((p) => lowered.includes(p));
  const fingerprint = ctx.privacy.contentHash(
    repo,
    canonicalJson({
      repo: repo.id,
      message: normalizeMessage(node.message),
      additions: node.additions,
      deletions: node.deletions,
      changedFiles: node.changedFilesIfAvailable,
    }),
  );
  const sha = ctx.privacy.objectId(repo, node.oid);

  return {
    key: `commit:${repo.id}:${sha}`,
    type: "commit",
    rev: 0,
    repo,
    actor: actorRef(primary, ctx, repo),
    occurredAt: node.authoredDate,
    firstSeenAt: UNSET,
    metadata: {
      sha,
      parentCount: node.parents.totalCount,
      additions: node.additions,
      deletions: node.deletions,
      changedFiles: node.changedFilesIfAvailable,
      authoredAt: node.authoredDate,
      committedAt: node.committedDate,
      onDefaultBranch: true,
      playerIsPrimaryAuthor: primary?.databaseId === ctx.player.id,
      coAuthorIds,
      fingerprint,
      messagePatternHit,
    },
    provenance: provenance("commits", "graphql"),
    verification: verification(notes),
  };
}

export interface PullRequestInput {
  id: string;
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  merged: boolean;
  mergedAt: string | null;
  createdAt: string;
  author: GqlActor;
  mergedBy: GqlActor;
  commits: { totalCount: number };
  reviews: { totalCount: number; nodes: Array<{ author: GqlActor }> };
}

export function pullRequestKey(prNodeId: string, repo: RepoRef, ctx: NormalizeContext): string {
  return `pr:${ctx.privacy.objectId(repo, prNodeId)}`;
}

export function normalizePullRequest(
  pr: PullRequestInput,
  repo: RepoRef,
  ctx: NormalizeContext,
): NormalizedEvent<"pull_request"> {
  const notes: string[] = [];
  if (pr.reviews.totalCount > pr.reviews.nodes.length) notes.push("approvals_truncated");
  const author = actorRef(pr.author, ctx, repo);
  if (author === null) notes.push("author_unknown");
  const approvers = new Map<number, string | null>();
  for (const review of pr.reviews.nodes) {
    const a = review.author;
    if (a === null || actorKindOf(a.__typename, a.login) !== "user") continue;
    const id = a.databaseId;
    if (typeof id !== "number" || id === ctx.player.id) continue;
    approvers.set(id, a.createdAt ?? null);
  }
  const metadata: NormalizedEvent<"pull_request">["metadata"] = {
    state: pr.state,
    merged: pr.merged,
    mergedAt: pr.mergedAt,
    createdAt: pr.createdAt,
    authorIsPlayer: author?.isPlayer ?? false,
    mergedByIsPlayer: pr.mergedBy === null ? null : pr.mergedBy.databaseId === ctx.player.id,
    approvers: [...approvers.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, accountCreatedAt]) => ({ id, accountCreatedAt })),
    commitCount: pr.commits.totalCount,
  };
  if (repo.visibility === "public") metadata.number = pr.number;
  return {
    key: pullRequestKey(pr.id, repo, ctx),
    type: "pull_request",
    rev: 0,
    repo,
    actor: author,
    occurredAt: pr.mergedAt ?? pr.createdAt,
    firstSeenAt: UNSET,
    metadata,
    provenance: provenance("pullRequests", "graphql"),
    verification: verification(notes),
  };
}

export interface ReviewInput {
  databaseId: number;
  state: string;
  submittedAt: string | null;
  body: string;
  prNodeId: string;
  prAuthor: GqlActor;
  occurredAt: string;
}

/** One review event per (PR, player): STK-3 counts a PR once however many reviews are left. */
export function normalizeReview(
  review: ReviewInput,
  repo: RepoRef,
  ctx: NormalizeContext,
): NormalizedEvent<"review"> {
  const prKey = pullRequestKey(review.prNodeId, repo, ctx);
  const notes: string[] = [];
  if (review.submittedAt === null) notes.push("submitted_at_missing");
  return {
    key: `review:${prKey.slice(3)}:${ctx.player.id}`,
    type: "review",
    rev: 0,
    repo,
    actor: { id: ctx.player.id, kind: "user", isPlayer: true },
    occurredAt: review.submittedAt ?? review.occurredAt,
    firstSeenAt: UNSET,
    metadata: {
      pullRequestKey: prKey,
      prAuthor: actorRef(review.prAuthor, ctx, repo),
      state: review.state,
      hasBody: review.body.trim().length > 0,
      submittedAt: review.submittedAt,
    },
    provenance: provenance("reviews", "graphql"),
    verification: verification(notes),
  };
}

/** Several reviews of the same PR collapse into the earliest, with `hasBody` if any had one. */
export function combineReviews(
  a: NormalizedEvent<"review">,
  b: NormalizedEvent<"review">,
): NormalizedEvent<"review"> {
  const [first, second] = a.occurredAt <= b.occurredAt ? [a, b] : [b, a];
  return {
    ...first,
    metadata: { ...first.metadata, hasBody: first.metadata.hasBody || second.metadata.hasBody },
    provenance: {
      ...first.provenance,
      sources: [...new Set([...first.provenance.sources, ...second.provenance.sources])].sort(),
    },
  };
}

export interface IssueInput {
  id: string;
  number: number;
  state: "OPEN" | "CLOSED";
  stateReason: string | null;
  createdAt: string;
  closedAt: string | null;
  author: GqlActor;
  /** Undefined when this source does not report the closer. */
  closedBy?: GqlActor | undefined;
}

export function normalizeIssue(
  issue: IssueInput,
  repo: RepoRef,
  ctx: NormalizeContext,
  source: SourceId,
): NormalizedEvent<"issue"> {
  const notes: string[] = [];
  const author = actorRef(issue.author, ctx, repo);
  let closedByPlayer: boolean | null = null;
  if (issue.state === "CLOSED") {
    if (issue.closedBy === undefined) notes.push("closer_not_observed");
    else if (issue.closedBy === null) notes.push("closer_unknown");
    else closedByPlayer = issue.closedBy.databaseId === ctx.player.id;
  }
  const metadata: NormalizedEvent<"issue">["metadata"] = {
    state: issue.state,
    stateReason: issue.stateReason,
    createdAt: issue.createdAt,
    closedAt: issue.closedAt,
    author,
    closedByPlayer,
  };
  if (repo.visibility === "public") metadata.number = issue.number;
  return {
    key: `issue:${ctx.privacy.objectId(repo, issue.id)}`,
    type: "issue",
    rev: 0,
    repo,
    actor: author,
    occurredAt: issue.closedAt ?? issue.createdAt,
    firstSeenAt: UNSET,
    metadata,
    provenance: provenance(source, "graphql"),
    verification: verification(notes),
  };
}

/** The same issue seen as "opened by player" and as "closed in owned repo": keep the observation that knows the closer. */
export function combineIssues(
  a: NormalizedEvent<"issue">,
  b: NormalizedEvent<"issue">,
): NormalizedEvent<"issue"> {
  const knows = (e: NormalizedEvent<"issue">) => e.metadata.closedByPlayer !== null;
  const keep =
    knows(a) && !knows(b) ? a : knows(b) && !knows(a) ? b : a.occurredAt >= b.occurredAt ? a : b;
  const other = keep === a ? b : a;
  return {
    ...keep,
    provenance: {
      ...keep.provenance,
      sources: [...new Set([...keep.provenance.sources, ...other.provenance.sources])].sort(),
    },
  };
}

const SAFE_TAG = /[^A-Za-z0-9._+\-/]/g;

export function sanitizeTag(tag: string): string {
  const cleaned = tag.normalize("NFC").replace(SAFE_TAG, "").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "untitled";
}

export function normalizeRelease(
  release: z.output<typeof restReleaseSchema>,
  repo: RepoRef,
  ctx: NormalizeContext,
): NormalizedEvent<"release"> {
  const notes: string[] = [];
  if (release.author === null) notes.push("author_unknown");
  const metadata: NormalizedEvent<"release">["metadata"] = {
    isDraft: release.draft,
    isPrerelease: release.prerelease,
    publishedAt: release.published_at,
    hasNotes: (release.body ?? "").trim().length > 0,
    authorIsPlayer: release.author?.id === ctx.player.id,
  };
  if (repo.visibility === "public") metadata.tag = sanitizeTag(release.tag_name);
  return {
    key: `release:${repo.id}:${ctx.privacy.objectId(repo, String(release.id))}`,
    type: "release",
    rev: 0,
    repo,
    actor:
      release.author === null
        ? null
        : {
            id: release.author.id,
            kind: actorKindOf(release.author.type, release.author.login),
            isPlayer: release.author.id === ctx.player.id,
          },
    occurredAt: release.published_at ?? release.created_at,
    firstSeenAt: UNSET,
    metadata,
    provenance: provenance("releases", "rest"),
    verification: verification(notes),
  };
}

export function normalizeWorkflowRun(
  run: z.output<typeof restWorkflowRunSchema>,
  repo: RepoRef,
  ctx: NormalizeContext,
): NormalizedEvent<"workflow_run"> {
  const actorKind = run.actor ? actorKindOf(run.actor.type, run.actor.login) : "unknown";
  return {
    key: `run:${repo.id}:${ctx.privacy.objectId(repo, String(run.id))}`,
    type: "workflow_run",
    rev: 0,
    repo,
    actor: run.actor
      ? { id: run.actor.id, kind: actorKind, isPlayer: run.actor.id === ctx.player.id }
      : null,
    occurredAt: run.created_at,
    firstSeenAt: UNSET,
    metadata: {
      event: run.event,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      actorIsPlayer: run.actor?.id === ctx.player.id,
      triggeredByPlayer: (run.triggering_actor ?? run.actor)?.id === ctx.player.id,
      actorKind,
    },
    provenance: provenance("workflowRuns", "rest"),
    verification: verification(run.actor === null ? ["actor_unknown"] : []),
  };
}

export function normalizeContributionDay(
  date: string,
  count: number,
  ctx: NormalizeContext,
): NormalizedEvent<"contribution_day"> {
  return {
    key: `cal:${date}`,
    type: "contribution_day",
    rev: 0,
    repo: null,
    actor: { id: ctx.player.id, kind: "user", isPlayer: true },
    occurredAt: `${date}T00:00:00Z`,
    firstSeenAt: UNSET,
    metadata: { date, count },
    provenance: provenance("calendar", "graphql"),
    // GitHub's calendar day boundary is not yet confirmed against Asia/Jakarta (blocker B-02).
    verification: { status: "partial", notes: ["calendar_timezone_unconfirmed"] },
  };
}

export function normalizePrivateCount(
  windowFrom: string,
  windowTo: string,
  count: number,
  ctx: NormalizeContext,
): NormalizedEvent<"private_contribution_count"> {
  return {
    key: `private_count:${windowFrom}:${windowTo}`,
    type: "private_contribution_count",
    rev: 0,
    repo: null,
    actor: { id: ctx.player.id, kind: "user", isPlayer: true },
    occurredAt: windowTo,
    firstSeenAt: UNSET,
    metadata: { windowFrom, windowTo, restrictedContributionsCount: count },
    provenance: provenance("calendar", "graphql"),
    verification: { status: "verified", notes: [] },
  };
}

export function normalizeRepoSnapshot(
  languages: z.output<typeof restLanguagesSchema>,
  pushedAt: string | null,
  observedOn: string,
  repo: RepoRef,
): NormalizedEvent<"repo_snapshot"> {
  const sorted: Record<string, number> = {};
  for (const name of Object.keys(languages).sort()) {
    const bytes = languages[name];
    if (bytes !== undefined) sorted[name] = bytes;
  }
  return {
    key: `repo_snapshot:${repo.id}:${observedOn}`,
    type: "repo_snapshot",
    rev: 0,
    repo,
    actor: null,
    occurredAt: `${observedOn}T00:00:00Z`,
    firstSeenAt: UNSET,
    metadata: { observedOn, languages: sorted, pushedAt },
    provenance: provenance("languages", "rest"),
    verification: { status: "verified", notes: [] },
  };
}
