import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FetchLike } from "../../src/github/client.ts";

export function fixture(name: string): unknown {
  const path = fileURLToPath(new URL(`../fixtures/api/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

export interface FakeResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  /** Raw body text (overrides `body`), for malformed-response tests. */
  raw?: string;
  /** Simulate a network failure instead of a response. */
  networkError?: boolean;
}

export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  operationName?: string;
  variables?: Record<string, unknown>;
}

type Matcher = (req: RecordedRequest) => boolean;

/**
 * Test transport: routes are matched in registration order; each route serves its
 * responses in sequence and repeats the last one. Unmatched requests throw so tests
 * fail loudly instead of hitting the network.
 */
export class FixtureFetch {
  readonly calls: RecordedRequest[] = [];
  readonly #routes: Array<{ match: Matcher; responses: FakeResponse[]; served: number }> = [];

  on(match: string | Matcher, ...responses: FakeResponse[]): this {
    const matcher: Matcher =
      typeof match === "string"
        ? match.startsWith("graphql:")
          ? (req) => req.operationName === match.slice("graphql:".length)
          : (req) => `${req.method} ${req.path}` === match
        : match;
    this.#routes.push({ match: matcher, responses, served: 0 });
    return this;
  }

  /** Registers a route that takes precedence over all existing routes. */
  override(match: string | Matcher, ...responses: FakeResponse[]): this {
    this.on(match, ...responses);
    const route = this.#routes.pop();
    if (route) this.#routes.unshift(route);
    return this;
  }

  readonly fetch: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    const req: RecordedRequest = {
      method: init.method,
      url,
      path: parsed.pathname,
      query: parsed.searchParams,
      headers: init.headers,
    };
    if (init.body !== undefined) {
      const body = JSON.parse(init.body) as {
        operationName?: string;
        variables?: Record<string, unknown>;
      };
      if (body.operationName !== undefined) req.operationName = body.operationName;
      if (body.variables !== undefined) req.variables = body.variables;
    }
    this.calls.push(req);
    const route = this.#routes.find((r) => r.match(req));
    if (!route)
      throw new Error(
        `Unmatched fixture request: ${req.method} ${req.path} ${req.operationName ?? ""}`,
      );
    const response = route.responses[Math.min(route.served, route.responses.length - 1)];
    route.served++;
    if (!response || response.networkError) throw new TypeError("fetch failed");
    const headers = new Map(
      Object.entries(response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const text = response.raw ?? JSON.stringify(response.body ?? null);
    return {
      status: response.status ?? 200,
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      text: async () => text,
    };
  };
}

export const noSleep = async (_ms: number) => {};
