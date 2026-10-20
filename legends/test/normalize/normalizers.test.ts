import { describe, expect, it } from "vitest";
import {
  gqlCommitHistorySchema,
  gqlPullRequestContributionsSchema,
  restReleaseListSchema,
} from "../../src/github/schemas.ts";
import {
  combineReviews,
  type NormalizeContext,
  normalizeCommit,
  normalizeIssue,
  normalizeMessage,
  normalizePullRequest,
  normalizeRelease,
  normalizeReview,
  sanitizeTag,
} from "../../src/normalize/normalizers.ts";
import { Privacy } from "../../src/normalize/privacy.ts";
import { fixture } from "../helpers/fixture-fetch.ts";

const player = {
  id: 1000001,
  nodeId: "U_sample001",
  login: "sample-player",
  createdAt: "2022-01-10T08:00:00Z",
};
const ctx: NormalizeContext = {
  player,
  privacy: new Privacy({ playerLogin: "sample-player", privateEnabled: false }),
  automationPatterns: ["[skip ci]", "auto-update"],
};
const alpha = ctx.privacy.repoRef({
  databaseId: 2000001,
  owner: "sample-player",
  name: "alpha",
  isPrivate: false,
  isFork: false,
  isArchived: false,
});
const library = ctx.privacy.repoRef({
  databaseId: 2000003,
  owner: "other-org",
  name: "library",
  isPrivate: false,
  isFork: false,
  isArchived: false,
});

function commits(name: string) {
  const parsed = gqlCommitHistorySchema.parse((fixture(name) as { data: unknown }).data);
  return parsed.repository?.defaultBranchRef?.target?.history?.nodes ?? [];
}

describe("normalizeCommit", () => {
  const [feat, merge, empty] = commits("commits-alpha-page1.json").map((n) =>
    normalizeCommit(n, alpha, ctx),
  );
  const [auto, rebased, typo] = commits("commits-alpha-page2.json").map((n) =>
    normalizeCommit(n, alpha, ctx),
  );

  it("builds a stable key from repo id and SHA", () => {
    expect(feat?.key).toMatch(/^commit:gh:2000001:[0-9a-f]{40}$/);
  });

  it("keeps qualification facts and drops the message", () => {
    expect(feat?.metadata).toMatchObject({
      parentCount: 1,
      additions: 120,
      deletions: 10,
      playerIsPrimaryAuthor: true,
      coAuthorIds: [1000002],
    });
    expect(merge?.metadata.parentCount).toBe(2);
    expect((empty?.metadata.additions ?? -1) + (empty?.metadata.deletions ?? -1)).toBe(0);
    expect(JSON.stringify([feat, merge, empty, auto, rebased, typo])).not.toMatch(
      /battle engine|Co-authored-by|example\.invalid/i,
    );
  });

  it("flags automation message patterns case-insensitively", () => {
    expect(auto?.metadata.messagePatternHit).toBe(true);
    expect(feat?.metadata.messagePatternHit).toBe(false);
  });

  it("gives rebased copies (same normalised message and size) the same fingerprint", () => {
    expect(rebased?.metadata.fingerprint).toBe(feat?.metadata.fingerprint);
    expect(rebased?.key).not.toBe(feat?.key);
    expect(typo?.metadata.fingerprint).not.toBe(feat?.metadata.fingerprint);
  });

  it("marks missing optional facts as partial verification", () => {
    expect(feat?.verification).toEqual({ status: "verified", notes: [] });
    expect(typo?.verification).toEqual({ status: "partial", notes: ["changed_files_unavailable"] });
  });

  it("normalises messages by removing trailers, whitespace and case", () => {
    expect(normalizeMessage("Fix:  Thing\n\nSigned-off-by: A <a@b>\nCo-authored-by: C <c@d>")).toBe(
      "fix: thing",
    );
  });
});

describe("normalizePullRequest", () => {
  const nodes =
    gqlPullRequestContributionsSchema.parse(
      (fixture("pull-requests.json") as { data: unknown }).data,
    ).user?.contributionsCollection.pullRequestContributions.nodes ?? [];

  it("keeps only human, non-player approvers", () => {
    const own = normalizePullRequest(nodes[0]?.pullRequest as never, alpha, ctx);
    expect(own.metadata.approvers).toEqual([
      { id: 1000002, accountCreatedAt: "2020-05-01T00:00:00Z" },
    ]);
    expect(own.metadata).toMatchObject({
      authorIsPlayer: true,
      mergedByIsPlayer: true,
      merged: true,
      number: 7,
    });
    expect(own.key).toBe("pr:PR_alpha1");
  });

  it("notes truncated approval lists instead of hiding them", () => {
    const external = normalizePullRequest(nodes[1]?.pullRequest as never, library, ctx);
    expect(external.verification.notes).toContain("approvals_truncated");
    expect(external.metadata.mergedByIsPlayer).toBe(false);
  });
});

describe("reviews", () => {
  it("collapses several reviews of one PR to the earliest, keeping hasBody", () => {
    const base = { prNodeId: "PR_lib9", prAuthor: null, occurredAt: "x" };
    const a = normalizeReview(
      {
        ...base,
        databaseId: 1,
        state: "COMMENTED",
        submittedAt: "2026-10-16T02:00:00Z",
        body: "nit",
      },
      library,
      ctx,
    );
    const b = normalizeReview(
      { ...base, databaseId: 2, state: "APPROVED", submittedAt: "2026-10-15T02:00:00Z", body: "" },
      library,
      ctx,
    );
    expect(a.key).toBe(b.key);
    const merged = combineReviews(a, b);
    expect(merged.occurredAt).toBe("2026-10-15T02:00:00Z");
    expect(merged.metadata.hasBody).toBe(true);
    expect(combineReviews(b, a)).toEqual(merged);
  });
});

describe("issues", () => {
  const author = { __typename: "User", login: "sample-ally", databaseId: 1000002 };
  const input = {
    id: "I_1",
    number: 1,
    state: "CLOSED" as const,
    stateReason: "COMPLETED",
    createdAt: "2026-10-01T00:00:00Z",
    closedAt: "2026-10-02T00:00:00Z",
    author,
  };

  it("distinguishes unknown closer from a closer that was not observed", () => {
    expect(normalizeIssue(input, alpha, ctx, "issues").verification.notes).toEqual([
      "closer_not_observed",
    ]);
    expect(
      normalizeIssue({ ...input, closedBy: null }, alpha, ctx, "closedIssues").verification.notes,
    ).toEqual(["closer_unknown"]);
    expect(
      normalizeIssue(
        { ...input, closedBy: { __typename: "User", login: "sample-player", databaseId: 1000001 } },
        alpha,
        ctx,
        "closedIssues",
      ).metadata.closedByPlayer,
    ).toBe(true);
  });

  it("keeps the login of human allies on public repos only", () => {
    expect(normalizeIssue(input, alpha, ctx, "issues").actor?.login).toBe("sample-ally");
  });
});

describe("releases", () => {
  const releases = restReleaseListSchema.parse(fixture("releases-alpha.json"));

  it("sanitises tags so markup cannot pass through", () => {
    const hostile = normalizeRelease(releases[1] as never, alpha, ctx);
    expect(hostile.metadata.tag).toBe("imgsrcxonerroralert1");
    expect(sanitizeTag("💥")).toBe("untitled");
    expect(sanitizeTag("v1.2.3-rc.1+build/7")).toBe("v1.2.3-rc.1+build/7");
  });

  it("records notes presence without storing the notes", () => {
    const first = normalizeRelease(releases[0] as never, alpha, ctx);
    expect(first.metadata).toMatchObject({ hasNotes: true, authorIsPlayer: true, tag: "v1.0.0" });
    expect(JSON.stringify(first)).not.toContain("Release notes");
    expect(JSON.stringify(first)).not.toContain("ignored title");
  });
});
