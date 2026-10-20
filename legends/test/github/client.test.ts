import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CollectError } from "../../src/core/errors.ts";
import { createLogger } from "../../src/core/log.ts";
import { GitHubClient, parseNextLink } from "../../src/github/client.ts";
import { FixtureFetch, noSleep } from "../helpers/fixture-fetch.ts";

const TOKEN = "test-token-not-real";
const listSchema = z.array(z.object({ id: z.number() }));

function make(
  fake: FixtureFetch,
  overrides: Partial<ConstructorParameters<typeof GitHubClient>[0]> = {},
) {
  const sleeps: number[] = [];
  const client = new GitHubClient({
    fetch: fake.fetch,
    token: TOKEN,
    maxRequests: 50,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    now: () => Date.parse("2026-10-20T00:00:00Z"),
    ...overrides,
  });
  return { client, sleeps };
}

async function catchError(p: Promise<unknown>): Promise<CollectError> {
  try {
    await p;
  } catch (error) {
    if (error instanceof CollectError) return error;
    throw error;
  }
  throw new Error("expected a CollectError");
}

describe("GitHubClient.rest", () => {
  it("sends auth, API version and user agent headers and validates the response", async () => {
    const fake = new FixtureFetch().on("GET /users/sample-player", {
      body: { id: 1, extra: "dropped" },
    });
    const { client } = make(fake);
    const data = await client.rest(
      "GET /users/{username}",
      { username: "sample-player" },
      z.object({ id: z.number() }),
    );
    expect(data).toEqual({ id: 1 });
    const headers = fake.calls[0]?.headers ?? {};
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(headers["User-Agent"]).toMatch(/^github-legends\//);
  });

  it("rejects path parameters that are not plain GitHub name segments", async () => {
    const { client } = make(new FixtureFetch());
    for (const bad of ["../etc", "a/b", "", "x?y=1", "%2e%2e"]) {
      const error = await catchError(
        client.rest("GET /repos/{owner}/{repo}", { owner: bad, repo: "r" }, z.unknown()),
      );
      expect(error.kind).toBe("invalid_request");
    }
  });

  it("reports schema mismatches by path only, never by value", async () => {
    const fake = new FixtureFetch().on("GET /users/x", { body: { id: "secret-looking-value" } });
    const { client } = make(fake);
    const error = await catchError(
      client.rest("GET /users/{username}", { username: "x" }, z.object({ id: z.number() })),
    );
    expect(error.kind).toBe("invalid_response");
    expect(error.message).toContain("id");
    expect(error.message).not.toContain("secret-looking-value");
  });

  it("fails on non-JSON bodies", async () => {
    const fake = new FixtureFetch().on("GET /users/x", { raw: "<html>oops</html>" });
    const error = await catchError(
      make(fake).client.rest("GET /users/{username}", { username: "x" }, z.unknown()),
    );
    expect(error.kind).toBe("invalid_response");
  });

  it("maps HTTP errors to safe kinds without leaking the token or URL values", async () => {
    const cases: Array<[number, string]> = [
      [401, "auth"],
      [403, "forbidden"],
      [404, "not_found"],
      [422, "invalid_request"],
    ];
    for (const [status, kind] of cases) {
      const fake = new FixtureFetch().on("GET /repos/o/private-name", {
        status,
        body: { message: "detail" },
      });
      const error = await catchError(
        make(fake).client.rest(
          "GET /repos/{owner}/{repo}",
          { owner: "o", repo: "private-name" },
          z.unknown(),
        ),
      );
      expect(error.kind).toBe(kind);
      const text = JSON.stringify(error.toSafe());
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("private-name");
      expect(error.endpoint).toBe("GET /repos/{owner}/{repo}");
    }
  });
});

describe("retries and rate limits", () => {
  it("retries 5xx with bounded exponential backoff, then succeeds", async () => {
    const fake = new FixtureFetch().on(
      "GET /users/x",
      { status: 502 },
      { status: 503 },
      { body: { id: 1 } },
    );
    const { client, sleeps } = make(fake, { baseDelayMs: 1000, maxDelayMs: 3000 });
    await client.rest("GET /users/{username}", { username: "x" }, z.object({ id: z.number() }));
    expect(fake.calls).toHaveLength(3);
    // random() = 0.5 → delay = exp/2 + exp/4
    expect(sleeps).toEqual([750, 1500]);
  });

  it("gives up after maxRetries with a server error", async () => {
    const fake = new FixtureFetch().on("GET /users/x", { status: 500 });
    const { client, sleeps } = make(fake, { maxRetries: 2, maxDelayMs: 2000 });
    const error = await catchError(
      client.rest("GET /users/{username}", { username: "x" }, z.unknown()),
    );
    expect(error.kind).toBe("server");
    expect(fake.calls).toHaveLength(3);
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(2000);
  });

  it("retries network failures and reports a network error when they persist", async () => {
    const fake = new FixtureFetch().on("GET /users/x", { networkError: true });
    const error = await catchError(
      make(fake, { maxRetries: 1 }).client.rest(
        "GET /users/{username}",
        { username: "x" },
        z.unknown(),
      ),
    );
    expect(error.kind).toBe("network");
    expect(fake.calls).toHaveLength(2);
  });

  it("waits for Retry-After on secondary rate limits", async () => {
    const fake = new FixtureFetch().on(
      "GET /users/x",
      { status: 403, headers: { "retry-after": "7" } },
      { body: { id: 1 } },
    );
    const { client, sleeps } = make(fake);
    await client.rest("GET /users/{username}", { username: "x" }, z.object({ id: z.number() }));
    expect(sleeps).toEqual([7000]);
  });

  it("fails fast when the primary limit resets later than the allowed wait", async () => {
    const reset = String(Date.parse("2026-10-20T01:00:00Z") / 1000);
    const fake = new FixtureFetch().on("GET /users/x", {
      status: 403,
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-limit": "1000",
        "x-ratelimit-reset": reset,
      },
    });
    const error = await catchError(
      make(fake).client.rest("GET /users/{username}", { username: "x" }, z.unknown()),
    );
    expect(error.kind).toBe("rate_limited");
    expect(fake.calls).toHaveLength(1);
  });

  it("stops before the rate-limit reserve is consumed", async () => {
    const reset = String(Date.parse("2026-10-20T01:00:00Z") / 1000);
    const fake = new FixtureFetch().on("GET /users/x", {
      body: { id: 1 },
      headers: {
        "x-ratelimit-remaining": "10",
        "x-ratelimit-limit": "1000",
        "x-ratelimit-reset": reset,
      },
    });
    const { client } = make(fake, { minRemaining: 25 });
    await client.rest("GET /users/{username}", { username: "x" }, z.object({ id: z.number() }));
    expect(client.rateLimit("core")?.remaining).toBe(10);
    const error = await catchError(
      client.rest("GET /users/{username}", { username: "x" }, z.unknown()),
    );
    expect(error.kind).toBe("budget_exhausted");
    expect(fake.calls).toHaveLength(1);
  });

  it("enforces the per-run request budget, including retries", async () => {
    const fake = new FixtureFetch().on("GET /users/x", { status: 502 });
    const { client } = make(fake, { maxRequests: 2, maxRetries: 5 });
    const error = await catchError(
      client.rest("GET /users/{username}", { username: "x" }, z.unknown()),
    );
    expect(error.kind).toBe("budget_exhausted");
    expect(fake.calls).toHaveLength(2);
  });
});

describe("pagination", () => {
  const next = (page: number) => ({
    link: `<https://api.github.com/items?page=${page}>; rel="next"`,
  });

  it("follows Link headers to the end and reports completeness", async () => {
    const fake = new FixtureFetch()
      .on((r) => r.path === "/items" && r.query.get("page") === null, {
        body: [{ id: 1 }],
        headers: next(2),
      })
      .on((r) => r.query.get("page") === "2", { body: [{ id: 2 }], headers: next(3) })
      .on((r) => r.query.get("page") === "3", { body: [{ id: 3 }] });
    const page = await make(fake).client.paginateRest("GET /items", {}, listSchema, {
      maxPages: 10,
    });
    expect(page).toEqual({ items: [{ id: 1 }, { id: 2 }, { id: 3 }], pages: 3, complete: true });
    expect(fake.calls[0]?.query.get("per_page")).toBe("100");
  });

  it("stops at maxPages and marks the result incomplete", async () => {
    const fake = new FixtureFetch().on("GET /items", { body: [{ id: 1 }], headers: next(2) });
    const page = await make(fake).client.paginateRest("GET /items", {}, listSchema, {
      maxPages: 2,
    });
    expect(page.complete).toBe(false);
    expect(page.pages).toBe(2);
    expect(fake.calls).toHaveLength(2);
  });

  it("refuses to follow a pagination link to another origin (token protection)", async () => {
    const fake = new FixtureFetch().on("GET /items", {
      body: [{ id: 1 }],
      headers: { link: '<https://evil.example/items?page=2>; rel="next"' },
    });
    const error = await catchError(
      make(fake).client.paginateRest("GET /items", {}, listSchema, { maxPages: 5 }),
    );
    expect(error.kind).toBe("invalid_response");
    expect(fake.calls).toHaveLength(1);
  });

  it("rejects unbounded or invalid page caps", async () => {
    const { client } = make(new FixtureFetch());
    for (const maxPages of [0, -1, 101, 1.5, Number.POSITIVE_INFINITY]) {
      const error = await catchError(
        client.paginateRest("GET /items", {}, listSchema, { maxPages }),
      );
      expect(error.kind).toBe("config");
    }
  });

  it("caps GraphQL connections and returns the resume cursor", async () => {
    const { client } = make(new FixtureFetch());
    let calls = 0;
    const result = await client.paginateGraphql(async (after) => {
      calls++;
      return { nodes: [after ?? "start"], pageInfo: { hasNextPage: true, endCursor: `c${calls}` } };
    }, 3);
    expect(result).toEqual({
      items: ["start", "c1", "c2"],
      pages: 3,
      complete: false,
      endCursor: "c3",
    });
  });

  it("parses rel=next among several link relations", () => {
    expect(
      parseNextLink('<https://a/x?page=1>; rel="prev", <https://a/x?page=3>; rel="next"'),
    ).toBe("https://a/x?page=3");
    expect(parseNextLink('<https://a/x?page=1>; rel="last"')).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });
});

describe("GraphQL", () => {
  const schema = z.object({ viewer: z.object({ login: z.string() }) });

  it("posts the operation name and variables", async () => {
    const fake = new FixtureFetch().on("graphql:Op", {
      body: { data: { viewer: { login: "a" } } },
    });
    const data = await make(fake).client.graphql(
      "Op",
      "query Op { viewer { login } }",
      { x: 1 },
      schema,
    );
    expect(data.viewer.login).toBe("a");
    expect(fake.calls[0]?.variables).toEqual({ x: 1 });
  });

  it("never returns partial data when errors are present", async () => {
    const fake = new FixtureFetch().on("graphql:Op", {
      body: {
        data: { viewer: { login: "a" } },
        errors: [{ type: "FORBIDDEN", message: "private repo secret-name" }],
      },
    });
    const error = await catchError(make(fake).client.graphql("Op", "q", {}, schema));
    expect(error.kind).toBe("graphql");
    expect(error.message).toBe("GraphQL errors: FORBIDDEN");
    expect(error.message).not.toContain("secret-name");
  });

  it("maps RATE_LIMITED and NOT_FOUND error types", async () => {
    for (const [type, kind] of [
      ["RATE_LIMITED", "rate_limited"],
      ["NOT_FOUND", "not_found"],
    ] as const) {
      const fake = new FixtureFetch().on("graphql:Op", {
        body: { data: null, errors: [{ type }] },
      });
      expect((await catchError(make(fake).client.graphql("Op", "q", {}, schema))).kind).toBe(kind);
    }
  });
});

describe("secret safety", () => {
  it("never writes the token to logs, even on failures", async () => {
    const lines: string[] = [];
    const fake = new FixtureFetch().on("GET /users/x", { status: 502 }, { body: { id: 1 } });
    const client = new GitHubClient({
      fetch: fake.fetch,
      token: TOKEN,
      maxRequests: 10,
      sleep: noSleep,
      logger: createLogger((l) => lines.push(l), "debug"),
    });
    await client.rest("GET /users/{username}", { username: "x" }, z.object({ id: z.number() }));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("requires a positive request budget", () => {
    expect(() => new GitHubClient({ maxRequests: 0 })).toThrow(CollectError);
  });
});
