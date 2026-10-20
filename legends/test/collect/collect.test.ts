import { describe, expect, it } from "vitest";
import { collect } from "../../src/collect/collect.ts";
import { parseCollectionConfig } from "../../src/collect/config.ts";
import { createLogger } from "../../src/core/log.ts";
import type { AnyEvent } from "../../src/normalize/event.ts";
import { fixture } from "../helpers/fixture-fetch.ts";
import { clientFor, RUN_AT, SALT, SINCE, sampleWorld } from "../helpers/world.ts";

const baseConfig = { login: "sample-player", since: SINCE, sources: { workflowRuns: true } };

function byType(events: AnyEvent[], type: AnyEvent["type"]) {
  return events.filter((e) => e.type === type);
}

describe("collect: healthy run", async () => {
  const fake = sampleWorld();
  const lines: string[] = [];
  const result = await collect({
    config: parseCollectionConfig(baseConfig),
    client: clientFor(fake),
    runAt: RUN_AT,
    logger: createLogger((l) => lines.push(l)),
  });

  it("completes and reports every source", () => {
    expect(result.status).toBe("complete");
    expect(result.fatal).toBeUndefined();
    expect(result.sources.map((s) => [s.source, s.status])).toEqual([
      ["calendar", "complete"],
      ["pullRequests", "complete"],
      ["reviews", "complete"],
      ["issues", "complete"],
      ["commits", "complete"],
      ["closedIssues", "complete"],
      ["releases", "complete"],
      ["languages", "complete"],
      ["workflowRuns", "complete"],
    ]);
    expect(result.player).toEqual({
      id: 1000001,
      nodeId: "U_sample001",
      login: "sample-player",
      createdAt: "2022-01-10T08:00:00Z",
    });
  });

  it("applies the repo scope: forks excluded, archived kept, unauthorised private dropped (count only)", () => {
    expect(result.scope.repos).toBe(3); // alpha, library, gamma (archived); beta-fork excluded
    expect(result.scope.droppedPrivate).toBe(1); // other-org/hidden-internal
    const repoIds = new Set(result.events.map((e) => e.repo?.id).filter(Boolean));
    expect(repoIds).not.toContain("gh:2000002");
    expect(JSON.stringify(result)).not.toContain("hidden-internal");
  });

  it("follows pagination for repos and commits", () => {
    expect(
      fake.calls.filter(
        (c) => c.path === "/users/sample-player/repos" || c.path === "/user/1000001/repos",
      ),
    ).toHaveLength(2);
    const alphaPages = fake.calls.filter(
      (c) => c.operationName === "LegendsCommitHistory" && c.variables?.name === "alpha",
    );
    expect(alphaPages.map((c) => c.variables?.after)).toEqual([null, "cursor-1"]);
    expect(byType(result.events, "commit")).toHaveLength(7); // 6 in alpha + 1 in library
  });

  it("drops records from private repos found via user-level queries", () => {
    expect(result.sources.find((s) => s.source === "pullRequests")?.droppedPrivate).toBe(1);
    expect(
      byType(result.events, "pull_request")
        .map((e) => e.key)
        .sort(),
    ).toEqual(["pr:PR_alpha1", "pr:PR_lib1"]);
  });

  it("deduplicates: one review per PR, one issue across two sources", () => {
    const reviews = byType(result.events, "review");
    expect(reviews.map((r) => r.key).sort()).toEqual([
      "review:PR_lib10:1000001",
      "review:PR_lib9:1000001",
    ]);
    const issue = result.events.find((e) => e.key === "issue:I_alpha1");
    expect(issue?.provenance.sources).toEqual(["closedIssues", "issues"]);
    expect(issue?.type === "issue" && issue.metadata.closedByPlayer).toBe(true);
    expect(result.stats.duplicates).toBeGreaterThanOrEqual(2);
  });

  it("produces sorted, uniquely keyed events", () => {
    const keys = result.events.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  });

  it("filters releases to the collection window and keeps bot workflow runs flagged", () => {
    expect(byType(result.events, "release")).toHaveLength(2);
    const runs = byType(result.events, "workflow_run");
    expect(runs.map((r) => r.type === "workflow_run" && r.metadata.actorKind).sort()).toEqual([
      "bot",
      "user",
    ]);
  });

  it("stores no messages, titles, bodies or emails", () => {
    const text = JSON.stringify(result.events);
    for (const forbidden of [
      "battle engine",
      "Release notes",
      "ignored title",
      "Looks good",
      "example.invalid",
      "ignored@",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("logs safe JSON lines only", () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.startsWith("{")).toBe(true);
    expect(lines.join("\n")).not.toContain("test-token-not-real");
  });
});

describe("collect: failures are reported, never hidden", () => {
  it("marks a source partial when one repo fails and keeps the others", async () => {
    const world = sampleWorld().override("GET /repos/other-org/library/languages", { status: 500 });
    const result = await collect({
      config: parseCollectionConfig(baseConfig),
      client: clientFor(world),
      runAt: RUN_AT,
    });
    const languages = result.sources.find((s) => s.source === "languages");
    expect(languages?.status).toBe("partial");
    expect(languages?.issues).toEqual([
      {
        unit: "gh:2000003",
        error: {
          kind: "server",
          message: "HTTP 500",
          endpoint: "GET /repos/{owner}/{repo}/languages",
          status: 500,
          retryable: true,
        },
      },
    ]);
    expect(result.status).toBe("partial");
    expect(byType(result.events, "repo_snapshot")).toHaveLength(2);
  });

  it("marks sources partial when the page cap truncates data", async () => {
    const result = await collect({
      config: parseCollectionConfig({ ...baseConfig, limits: { maxPagesPerQuery: 1 } }),
      client: clientFor(sampleWorld()),
      runAt: RUN_AT,
    });
    const commits = result.sources.find((s) => s.source === "commits");
    expect(commits?.status).toBe("partial");
    expect(commits?.truncatedUnits).toEqual(["gh:2000001"]);
    expect(result.status).toBe("partial");
  });

  it("stops cleanly when the request budget runs out", async () => {
    const result = await collect({
      config: parseCollectionConfig(baseConfig),
      client: clientFor(sampleWorld(), 12),
      runAt: RUN_AT,
    });
    expect(result.status).toBe("partial");
    expect(result.stats.requests).toBe(12);
    const exhausted = result.sources
      .flatMap((s) => s.issues)
      .filter((i) => i.error.kind === "budget_exhausted");
    expect(exhausted.length).toBeGreaterThan(0);
    expect(result.sources.some((s) => s.status === "failed")).toBe(true);
  });

  it("fails fatally when the player cannot be resolved", async () => {
    const fake = sampleWorld().override("GET /users/sample-player", { status: 404 });
    const result = await collect({
      config: parseCollectionConfig(baseConfig),
      client: clientFor(fake),
      runAt: RUN_AT,
    });
    expect(result.status).toBe("failed");
    expect(result.fatal?.kind).toBe("not_found");
    expect(result.events).toEqual([]);
  });

  it("rejects an empty or inverted time window", async () => {
    const result = await collect({
      config: parseCollectionConfig({ ...baseConfig, since: RUN_AT }),
      client: clientFor(sampleWorld()),
      runAt: RUN_AT,
    });
    expect(result.fatal?.kind).toBe("config");
  });
});

describe("collect: private repositories", () => {
  const privateConfig = {
    ...baseConfig,
    scope: { owned: false, contributed: false },
    privateRepos: { enabled: true, allow: ["sample-player/secret-project"] },
    sources: {
      calendar: false,
      pullRequests: false,
      reviews: false,
      issues: false,
      workflowRuns: false,
    },
  };

  function privateWorld() {
    return sampleWorld()
      .on("GET /repos/sample-player/secret-project", { body: fixture("repo-private.json") })
      .on(
        (r) => r.operationName === "LegendsCommitHistory" && r.variables?.name === "secret-project",
        { body: fixture("commits-library.json") },
      )
      .on("GET /repos/sample-player/secret-project/releases", {
        body: fixture("releases-alpha.json"),
      })
      .on("GET /repos/sample-player/secret-project/languages", {
        body: fixture("languages-alpha.json"),
      });
  }

  it("refuses to run without the privacy salt", async () => {
    const result = await collect({
      config: parseCollectionConfig(privateConfig),
      client: clientFor(privateWorld()),
      runAt: RUN_AT,
    });
    expect(result.status).toBe("failed");
    expect(result.fatal?.kind).toBe("not_authorized_private");
  });

  it("collects allow-listed private repos under pseudonyms only", async () => {
    const result = await collect({
      config: parseCollectionConfig(privateConfig),
      client: clientFor(privateWorld()),
      runAt: RUN_AT,
      privacySalt: SALT,
    });
    expect(result.status).toBe("complete");
    expect(result.events.length).toBeGreaterThan(0);
    const text = JSON.stringify(result);
    for (const leaked of ["secret-project", "2000004", "v1.0.0", "lib1"])
      expect(text).not.toContain(leaked);
    for (const event of result.events) {
      expect(event.repo?.visibility).toBe("private");
      expect(event.repo?.id).toMatch(/^p:/);
    }
    // Languages are metadata: not collected for private repos unless includeLanguages is set.
    expect(byType(result.events, "repo_snapshot")).toHaveLength(0);
  });

  it("reports an allow-listed private repo the token cannot see as not authorised", async () => {
    const world = privateWorld().override("GET /repos/sample-player/secret-project", {
      status: 404,
    });
    const result = await collect({
      config: parseCollectionConfig(privateConfig),
      client: clientFor(world),
      runAt: RUN_AT,
      privacySalt: SALT,
    });
    expect(result.status).toBe("partial");
    expect(result.scope.issues).toEqual([
      {
        unit: "private#0",
        error: {
          kind: "not_authorized_private",
          message: "Allow-listed private repository is not accessible to the token",
          endpoint: "GET /repos/{owner}/{repo}",
          retryable: false,
        },
      },
    ]);
  });
});
