import { GitHubClient } from "../../src/github/client.ts";
import { FixtureFetch, fixture, noSleep } from "./fixture-fetch.ts";

export const RUN_AT = "2026-10-20T00:17:00Z";
export const SINCE = "2026-10-01T00:00:00Z";
export const SALT = "test-only-salt-0123456789abcdef0123456789";

/** A complete, healthy set of fixture routes for the sample player. */
export function sampleWorld(): FixtureFetch {
  return new FixtureFetch()
    .on("GET /users/sample-player", { body: fixture("user.json") })
    .on("GET /users/sample-player/repos", {
      body: fixture("repos-owned-page1.json"),
      headers: { link: '<https://api.github.com/user/1000001/repos?page=2>; rel="next"' },
    })
    .on("GET /user/1000001/repos", { body: fixture("repos-owned-page2.json") })
    .on("graphql:LegendsContributedRepos", { body: fixture("contributed.json") })
    .on("graphql:LegendsCalendar", { body: fixture("calendar.json") })
    .on("graphql:LegendsPullRequests", { body: fixture("pull-requests.json") })
    .on("graphql:LegendsReviews", { body: fixture("reviews.json") })
    .on("graphql:LegendsIssues", { body: fixture("issues.json") })
    .on(
      (r) =>
        r.operationName === "LegendsCommitHistory" &&
        r.variables?.name === "alpha" &&
        r.variables?.after === null,
      { body: fixture("commits-alpha-page1.json") },
    )
    .on((r) => r.operationName === "LegendsCommitHistory" && r.variables?.name === "alpha", {
      body: fixture("commits-alpha-page2.json"),
    })
    .on((r) => r.operationName === "LegendsCommitHistory" && r.variables?.name === "library", {
      body: fixture("commits-library.json"),
    })
    .on("graphql:LegendsCommitHistory", { body: fixture("commits-empty.json") })
    .on("graphql:LegendsClosedIssues", { body: fixture("closed-issues-alpha.json") })
    .on("GET /repos/sample-player/alpha/releases", { body: fixture("releases-alpha.json") })
    .on("GET /repos/sample-player/gamma/releases", { body: [] })
    .on("GET /repos/sample-player/alpha/languages", { body: fixture("languages-alpha.json") })
    .on("GET /repos/sample-player/gamma/languages", { body: {} })
    .on("GET /repos/other-org/library/languages", { body: fixture("languages-library.json") })
    .on("GET /repos/sample-player/alpha/actions/runs", {
      body: fixture("workflow-runs-alpha.json"),
    })
    .on("GET /repos/sample-player/gamma/actions/runs", {
      body: { total_count: 0, workflow_runs: [] },
    });
}

export function clientFor(fake: FixtureFetch, maxRequests = 200): GitHubClient {
  return new GitHubClient({
    fetch: fake.fetch,
    token: "test-token-not-real",
    maxRequests,
    sleep: noSleep,
    random: () => 0.5,
  });
}
