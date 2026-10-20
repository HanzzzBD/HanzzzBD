/**
 * Normalized event model (L1, "verified events").
 *
 * Every event records WHERE it came from (provenance) and HOW COMPLETE its facts are
 * (verification). Personal data is minimised: no commit messages, titles, bodies, branch
 * names, emails or file paths are stored. Private repositories appear only as keyed
 * pseudonyms (see privacy.ts).
 */
export const COLLECTOR_VERSION = "1";

export type SourceId =
  | "identity"
  | "scope"
  | "calendar"
  | "commits"
  | "pullRequests"
  | "reviews"
  | "issues"
  | "closedIssues"
  | "releases"
  | "languages"
  | "workflowRuns";

export type EventType =
  | "commit"
  | "pull_request"
  | "review"
  | "issue"
  | "release"
  | "workflow_run"
  | "contribution_day"
  | "private_contribution_count"
  | "repo_snapshot";

export type Visibility = "public" | "private";

export interface RepoRef {
  /** "gh:<databaseId>" for public repos, "p:<hmac>" for private ones. */
  id: string;
  visibility: Visibility;
  /** Present for public repos, and for private repos only when explicitly allowed. */
  fullName?: string;
  ownedByPlayer: boolean;
  isFork: boolean;
  isArchived: boolean;
}

export type ActorKind = "user" | "bot" | "organization" | "unknown";

export interface ActorRef {
  /** GitHub numeric user id when known. Null for unknown or deleted (ghost) accounts. */
  id: number | null;
  kind: ActorKind;
  isPlayer: boolean;
  /** Public login, kept only for human non-player actors on public repos (allies, PRD §6.12). */
  login?: string;
  /** Account creation time, used for the human-account rule (GDD §1.4). */
  accountCreatedAt?: string;
}

export type VerificationStatus = "verified" | "partial" | "unverifiable";

export interface Verification {
  status: VerificationStatus;
  /** Machine-readable notes, e.g. "co_authors_truncated", "changed_files_unavailable". */
  notes: string[];
}

export interface Provenance {
  sources: SourceId[];
  api: "rest" | "graphql";
  collectorVersion: string;
}

export interface CommitMetadata {
  sha: string; // real SHA for public repos; keyed pseudonym for private repos
  parentCount: number;
  additions: number;
  deletions: number;
  changedFiles: number | null;
  authoredAt: string;
  committedAt: string;
  onDefaultBranch: true;
  playerIsPrimaryAuthor: boolean;
  coAuthorIds: number[];
  /** Hash of the normalised message and size; the message itself is discarded. */
  fingerprint: string;
  messagePatternHit: boolean;
}

export interface ApproverRef {
  id: number;
  accountCreatedAt: string | null;
}

export interface PullRequestMetadata {
  number?: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  merged: boolean;
  mergedAt: string | null;
  createdAt: string;
  authorIsPlayer: boolean;
  mergedByIsPlayer: boolean | null;
  /** Human, non-player accounts that approved. */
  approvers: ApproverRef[];
  commitCount: number;
}

export interface ReviewMetadata {
  pullRequestKey: string;
  prAuthor: ActorRef | null;
  state: string;
  hasBody: boolean;
  submittedAt: string | null;
}

export interface IssueMetadata {
  number?: number;
  state: "OPEN" | "CLOSED";
  stateReason: string | null;
  createdAt: string;
  closedAt: string | null;
  author: ActorRef | null;
  /** Null when the closer is unknown in this observation. */
  closedByPlayer: boolean | null;
}

export interface ReleaseMetadata {
  tag?: string;
  isDraft: boolean;
  isPrerelease: boolean;
  publishedAt: string | null;
  hasNotes: boolean;
  authorIsPlayer: boolean;
}

export interface WorkflowRunMetadata {
  event: string;
  status: string | null;
  conclusion: string | null;
  createdAt: string;
  actorIsPlayer: boolean;
  triggeredByPlayer: boolean;
  actorKind: ActorKind;
}

export interface ContributionDayMetadata {
  date: string;
  count: number;
}

export interface PrivateCountMetadata {
  windowFrom: string;
  windowTo: string;
  restrictedContributionsCount: number;
}

export interface RepoSnapshotMetadata {
  observedOn: string;
  languages: Record<string, number>;
  pushedAt: string | null;
}

export interface MetadataByType {
  commit: CommitMetadata;
  pull_request: PullRequestMetadata;
  review: ReviewMetadata;
  issue: IssueMetadata;
  release: ReleaseMetadata;
  workflow_run: WorkflowRunMetadata;
  contribution_day: ContributionDayMetadata;
  private_contribution_count: PrivateCountMetadata;
  repo_snapshot: RepoSnapshotMetadata;
}

export interface NormalizedEvent<T extends EventType = EventType> {
  /** Stable identifier; the same GitHub object always yields the same key. */
  key: string;
  type: T;
  /** Revision number; mutable facts (merged, closed) create a new revision. Set by mergeObservations. */
  rev: number;
  repo: RepoRef | null;
  actor: ActorRef | null;
  /** GitHub-reported time of the event (author date, mergedAt, submittedAt, …). */
  occurredAt: string;
  /** When this key was first observed. Set by mergeObservations; never changes afterwards. */
  firstSeenAt: string;
  metadata: MetadataByType[T];
  provenance: Provenance;
  verification: Verification;
}

export type AnyEvent = { [T in EventType]: NormalizedEvent<T> }[EventType];
