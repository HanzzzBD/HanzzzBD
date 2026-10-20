import { describe, expect, it } from "vitest";
import { CollectError } from "../../src/core/errors.ts";
import { normalizeCommit, normalizeIssue } from "../../src/normalize/normalizers.ts";
import { Privacy } from "../../src/normalize/privacy.ts";
import { SALT } from "../helpers/world.ts";

const secret = {
  databaseId: 2000004,
  owner: "sample-player",
  name: "secret-project",
  isPrivate: true,
  isFork: false,
  isArchived: false,
};
const player = {
  id: 1000001,
  nodeId: "U_sample001",
  login: "sample-player",
  createdAt: "2022-01-10T08:00:00Z",
};

describe("Privacy", () => {
  it("passes public repositories through unchanged", () => {
    const privacy = new Privacy({ playerLogin: "sample-player", privateEnabled: false });
    const ref = privacy.repoRef({ ...secret, isPrivate: false });
    expect(ref).toEqual({
      id: "gh:2000004",
      visibility: "public",
      fullName: "sample-player/secret-project",
      ownedByPlayer: true,
      isFork: false,
      isArchived: false,
    });
    expect(privacy.objectId(ref, "abc")).toBe("abc");
  });

  it("refuses private repositories unless explicitly enabled with a salt", () => {
    const privacy = new Privacy({ playerLogin: "sample-player", privateEnabled: false });
    expect(() => privacy.repoRef(secret)).toThrow(CollectError);
    expect(() => new Privacy({ playerLogin: "p", privateEnabled: true })).toThrow(/salt/);
    expect(() => new Privacy({ playerLogin: "p", privateEnabled: true, salt: "short" })).toThrow(
      /salt/,
    );
  });

  it("pseudonymises private identifiers with a keyed hash and hides the name", () => {
    const a = new Privacy({ playerLogin: "sample-player", privateEnabled: true, salt: SALT });
    const b = new Privacy({
      playerLogin: "sample-player",
      privateEnabled: true,
      salt: `${SALT}-other`,
    });
    const ref = a.repoRef(secret);
    expect(ref.id).toMatch(/^p:[0-9a-f]{20}$/);
    expect(ref.fullName).toBeUndefined();
    expect(JSON.stringify(ref)).not.toContain("secret-project");
    expect(JSON.stringify(ref)).not.toContain("2000004");
    expect(b.repoRef(secret).id).not.toBe(ref.id);
    expect(a.repoRef(secret).id).toBe(ref.id);
  });

  it("shows a private name only when explicitly allowed", () => {
    const privacy = new Privacy({
      playerLogin: "sample-player",
      privateEnabled: true,
      salt: SALT,
      allowPublicNames: ["Sample-Player/Secret-Project"],
    });
    expect(privacy.repoRef(secret).fullName).toBe("sample-player/secret-project");
  });

  it("strips SHAs, numbers, logins and messages from private events", () => {
    const privacy = new Privacy({ playerLogin: "sample-player", privateEnabled: true, salt: SALT });
    const ctx = { player, privacy, automationPatterns: [] };
    const ref = privacy.repoRef(secret);
    const commit = normalizeCommit(
      {
        oid: "a".repeat(40),
        authoredDate: "2026-10-15T00:00:00Z",
        committedDate: "2026-10-15T00:00:00Z",
        additions: 1,
        deletions: 1,
        changedFilesIfAvailable: 1,
        parents: { totalCount: 1 },
        message: "fix: leak secret thing",
        authors: {
          totalCount: 1,
          nodes: [{ user: { __typename: "User", login: "sample-player", databaseId: 1000001 } }],
        },
      },
      ref,
      ctx,
    );
    const issue = normalizeIssue(
      {
        id: "I_secret",
        number: 5,
        state: "OPEN",
        stateReason: null,
        createdAt: "2026-10-15T00:00:00Z",
        closedAt: null,
        author: { __typename: "User", login: "teammate", databaseId: 5 },
      },
      ref,
      ctx,
      "issues",
    );
    const text = JSON.stringify([commit, issue]);
    for (const leaked of [
      "a".repeat(40),
      "secret-project",
      "leak secret",
      "teammate",
      "I_secret",
      "2000004",
    ]) {
      expect(text).not.toContain(leaked);
    }
    expect(issue.metadata.number).toBeUndefined();
  });
});
