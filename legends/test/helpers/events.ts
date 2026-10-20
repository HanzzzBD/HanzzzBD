import { sha256Hex } from "../../src/core/hash.ts";
import type { EngineConfig } from "../../src/engine/qualify.ts";
import type { ActorRef, AnyEvent, NormalizedEvent, RepoRef } from "../../src/normalize/event.ts";

export const TZ = "Asia/Jakarta";
export const CONFIG: EngineConfig = {
  timezone: TZ,
  season1Start: "2026-10-01",
  automationRepos: [],
  excludeRepos: [],
};
export const PLAYER_ID = 1000001;

export const OWN: RepoRef = {
  id: "gh:1",
  visibility: "public",
  fullName: "sample-player/alpha",
  ownedByPlayer: true,
  isFork: false,
  isArchived: false,
};
export const OWN2: RepoRef = {
  id: "gh:2",
  visibility: "public",
  fullName: "sample-player/beta",
  ownedByPlayer: true,
  isFork: false,
  isArchived: false,
};
export const EXT: RepoRef = {
  id: "gh:3",
  visibility: "public",
  fullName: "other-org/library",
  ownedByPlayer: false,
  isFork: false,
  isArchived: false,
};
export const FORK: RepoRef = {
  id: "gh:4",
  visibility: "public",
  fullName: "sample-player/fork",
  ownedByPlayer: true,
  isFork: true,
  isArchived: false,
};

const PROV = (
  source: "commits" | "pullRequests" | "reviews" | "issues" | "releases" | "calendar",
) => ({ sources: [source], api: "graphql" as const, collectorVersion: "1" });
const OK = { status: "verified" as const, notes: [] };
export const PLAYER: ActorRef = { id: PLAYER_ID, kind: "user", isPlayer: true };
export const HUMAN = (id = 2000, createdAt = "2020-01-01T00:00:00Z"): ActorRef => ({
  id,
  kind: "user",
  isPlayer: false,
  login: `user${id}`,
  accountCreatedAt: createdAt,
});
export const BOT: ActorRef = { id: 49699333, kind: "bot", isPlayer: false };

/** Local Jakarta time helper: wib("2026-10-15", "10:00") → UTC instant string. */
export function wib(day: string, time = "10:00"): string {
  return new Date(Date.parse(`${day}T${time}:00+07:00`)).toISOString().replace(".000Z", "Z");
}

let counter = 0;
export function resetCounter(): void {
  counter = 0;
}

export interface CommitOpts {
  at: string;
  repo?: RepoRef;
  adds?: number;
  dels?: number;
  parents?: number;
  pattern?: boolean;
  sha?: string;
  fingerprint?: string;
  firstSeenAt?: string;
  actor?: ActorRef | null;
  primary?: boolean;
  rev?: number;
}

export function commit(o: CommitOpts): NormalizedEvent<"commit"> {
  counter++;
  const repo = o.repo ?? OWN;
  const sha = o.sha ?? sha256Hex(`commit-${counter}-${o.at}`).slice(0, 40);
  return {
    key: `commit:${repo.id}:${sha}`,
    type: "commit",
    rev: o.rev ?? 1,
    repo,
    actor: o.actor === undefined ? PLAYER : o.actor,
    occurredAt: o.at,
    firstSeenAt: o.firstSeenAt ?? o.at,
    metadata: {
      sha,
      parentCount: o.parents ?? 1,
      additions: o.adds ?? 10,
      deletions: o.dels ?? 2,
      changedFiles: 1,
      authoredAt: o.at,
      committedAt: o.at,
      onDefaultBranch: true,
      playerIsPrimaryAuthor: o.primary ?? true,
      coAuthorIds: [],
      fingerprint: o.fingerprint ?? sha256Hex(`fp-${counter}`),
      messagePatternHit: o.pattern ?? false,
    },
    provenance: PROV("commits"),
    verification: OK,
  };
}

export interface PrOpts {
  id?: string;
  mergedAt: string | null;
  repo?: RepoRef;
  approvers?: Array<{ id: number; accountCreatedAt: string | null }>;
  authorIsPlayer?: boolean;
  firstSeenAt?: string;
  rev?: number;
  actor?: ActorRef | null;
}

export function pr(o: PrOpts): NormalizedEvent<"pull_request"> {
  counter++;
  const created = o.mergedAt ?? "2026-10-01T00:00:00Z";
  return {
    key: `pr:${o.id ?? `PR_${counter}`}`,
    type: "pull_request",
    rev: o.rev ?? 1,
    repo: o.repo ?? OWN,
    actor: o.actor === undefined ? (o.authorIsPlayer === false ? HUMAN(5) : PLAYER) : o.actor,
    occurredAt: o.mergedAt ?? created,
    firstSeenAt: o.firstSeenAt ?? o.mergedAt ?? created,
    metadata: {
      number: counter,
      state: o.mergedAt ? "MERGED" : "OPEN",
      merged: o.mergedAt !== null,
      mergedAt: o.mergedAt,
      createdAt: created,
      authorIsPlayer: o.authorIsPlayer ?? true,
      mergedByIsPlayer: true,
      approvers: o.approvers ?? [],
      commitCount: 1,
    },
    provenance: PROV("pullRequests"),
    verification: OK,
  };
}

export function review(o: {
  at: string;
  prAuthor?: ActorRef | null;
  state?: string;
  hasBody?: boolean;
  repo?: RepoRef;
  id?: string;
}): NormalizedEvent<"review"> {
  counter++;
  const prId = o.id ?? `PR_r${counter}`;
  return {
    key: `review:${prId}:${PLAYER_ID}`,
    type: "review",
    rev: 1,
    repo: o.repo ?? EXT,
    actor: PLAYER,
    occurredAt: o.at,
    firstSeenAt: o.at,
    metadata: {
      pullRequestKey: `pr:${prId}`,
      prAuthor: o.prAuthor === undefined ? HUMAN() : o.prAuthor,
      state: o.state ?? "APPROVED",
      hasBody: o.hasBody ?? false,
      submittedAt: o.at,
    },
    provenance: PROV("reviews"),
    verification: OK,
  };
}

export function issue(o: {
  createdAt: string;
  closedAt?: string | null;
  stateReason?: string | null;
  author?: ActorRef | null;
  closedByPlayer?: boolean | null;
  repo?: RepoRef;
  id?: string;
  rev?: number;
  firstSeenAt?: string;
}): NormalizedEvent<"issue"> {
  counter++;
  const closed = o.closedAt ?? null;
  return {
    key: `issue:${o.id ?? `I_${counter}`}`,
    type: "issue",
    rev: o.rev ?? 1,
    repo: o.repo ?? OWN,
    actor: o.author === undefined ? PLAYER : o.author,
    occurredAt: closed ?? o.createdAt,
    firstSeenAt: o.firstSeenAt ?? o.createdAt,
    metadata: {
      number: counter,
      state: closed ? "CLOSED" : "OPEN",
      stateReason: o.stateReason ?? (closed ? "COMPLETED" : null),
      createdAt: o.createdAt,
      closedAt: closed,
      author: o.author === undefined ? PLAYER : o.author,
      closedByPlayer: o.closedByPlayer ?? (closed ? true : null),
    },
    provenance: PROV("issues"),
    verification: OK,
  };
}

export function release(o: {
  at: string;
  repo?: RepoRef;
  pre?: boolean;
  draft?: boolean;
  id?: string;
}): NormalizedEvent<"release"> {
  counter++;
  const repo = o.repo ?? OWN;
  return {
    key: `release:${repo.id}:${o.id ?? counter}`,
    type: "release",
    rev: 1,
    repo,
    actor: PLAYER,
    occurredAt: o.at,
    firstSeenAt: o.at,
    metadata: {
      tag: `v${counter}`,
      isDraft: o.draft ?? false,
      isPrerelease: o.pre ?? false,
      publishedAt: o.at,
      hasNotes: true,
      authorIsPlayer: true,
    },
    provenance: PROV("releases"),
    verification: OK,
  };
}

export function privateCount(
  windowFrom: string,
  windowTo: string,
  count: number,
): NormalizedEvent<"private_contribution_count"> {
  return {
    key: `private_count:${windowFrom}:${windowTo}`,
    type: "private_contribution_count",
    rev: 1,
    repo: null,
    actor: PLAYER,
    occurredAt: windowTo,
    firstSeenAt: windowTo,
    metadata: { windowFrom, windowTo, restrictedContributionsCount: count },
    provenance: PROV("calendar"),
    verification: OK,
  };
}

/** n commits on a local day, one minute apart starting at `time`, each a distinct change. */
export function commitsOn(
  day: string,
  n: number,
  opts: Partial<CommitOpts> = {},
  time = "09:00",
  spacingMs = 61_000,
): NormalizedEvent<"commit">[] {
  const start = Date.parse(wib(day, time));
  if (start + (n - 1) * spacingMs >= Date.parse(wib(day, "23:59")))
    throw new Error("commitsOn: commits would spill into the next day");
  return Array.from({ length: n }, (_, i) =>
    commit({ ...opts, at: new Date(start + i * spacingMs).toISOString().replace(".000Z", "Z") }),
  );
}

export type { AnyEvent };

export function snapshot(
  repo: RepoRef,
  observedOn: string,
  languages: Record<string, number>,
  topics?: string[],
): NormalizedEvent<"repo_snapshot"> {
  const metadata: NormalizedEvent<"repo_snapshot">["metadata"] = {
    observedOn,
    languages,
    pushedAt: null,
  };
  if (topics) metadata.topics = topics;
  return {
    key: `repo_snapshot:${repo.id}:${observedOn}`,
    type: "repo_snapshot",
    rev: 1,
    repo,
    actor: null,
    occurredAt: `${observedOn}T00:00:00Z`,
    firstSeenAt: `${observedOn}T00:00:00Z`,
    metadata,
    provenance: { sources: ["languages"], api: "rest", collectorVersion: "1" },
    verification: { status: "verified", notes: [] },
  };
}

export function markers(
  repo: RepoRef,
  observedOn: string,
  paths: string[],
): NormalizedEvent<"repo_markers"> {
  return {
    key: `repo_markers:${repo.id}:${observedOn}`,
    type: "repo_markers",
    rev: 1,
    repo,
    actor: null,
    occurredAt: `${observedOn}T00:00:00Z`,
    firstSeenAt: `${observedOn}T00:00:00Z`,
    metadata: { observedOn, paths, truncated: false },
    provenance: { sources: ["trees"], api: "rest", collectorVersion: "1" },
    verification: { status: "verified", notes: [] },
  };
}

export function workflowRun(
  repo: RepoRef,
  at: string,
  opts: {
    event?: string;
    conclusion?: string;
    bot?: boolean;
    byPlayer?: boolean;
    id?: string;
  } = {},
): NormalizedEvent<"workflow_run"> {
  counter++;
  return {
    key: `run:${repo.id}:${opts.id ?? counter}`,
    type: "workflow_run",
    rev: 1,
    repo,
    actor: opts.bot ? BOT : PLAYER,
    occurredAt: at,
    firstSeenAt: at,
    metadata: {
      event: opts.event ?? "push",
      status: "completed",
      conclusion: opts.conclusion ?? "success",
      createdAt: at,
      actorIsPlayer: !opts.bot,
      triggeredByPlayer: opts.byPlayer ?? !opts.bot,
      actorKind: opts.bot ? "bot" : "user",
    },
    provenance: { sources: ["workflowRuns"], api: "rest", collectorVersion: "1" },
    verification: { status: "verified", notes: [] },
  };
}
