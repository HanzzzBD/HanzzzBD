import type { z } from "zod";
import { CollectError } from "../core/errors.ts";
import { type Logger, silentLogger } from "../core/log.ts";

/** Minimal fetch contract so production uses `globalThis.fetch` and tests inject fixtures. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface GitHubClientOptions {
  /** Token for the Authorization header. Never logged, never included in errors. */
  token?: string | undefined;
  fetch?: FetchLike;
  baseUrl?: string;
  userAgent?: string;
  /** Hard cap on HTTP requests (including retries) for the lifetime of the client. */
  maxRequests: number;
  /** Retries after the first attempt, for retryable failures. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Longest wait the client accepts for a rate-limit reset before failing. */
  maxRateLimitWaitMs?: number;
  /** Stop before the primary rate limit drops below this many remaining requests. */
  minRemaining?: number;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  logger?: Logger;
}

export type QueryValue = string | number | boolean | undefined;

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetAtMs: number;
}

export interface PageResult<T> {
  items: T[];
  pages: number;
  /** False when more pages existed than `maxPages` allowed. Callers must not treat this as complete data. */
  complete: boolean;
}

export interface Connection<N> {
  nodes: N[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;
const ROUTE = /^(GET|POST) (\/[A-Za-z0-9_{}./-]*)$/;

export class GitHubClient {
  readonly #token: string | undefined;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  readonly #userAgent: string;
  readonly #maxRequests: number;
  readonly #maxRetries: number;
  readonly #baseDelayMs: number;
  readonly #maxDelayMs: number;
  readonly #maxRateLimitWaitMs: number;
  readonly #minRemaining: number;
  readonly #requestTimeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #random: () => number;
  readonly #now: () => number;
  readonly #log: Logger;
  #requests = 0;
  readonly #rate = new Map<string, RateLimitState>();

  constructor(options: GitHubClientOptions) {
    if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) {
      throw new CollectError("config", "maxRequests must be a positive integer");
    }
    this.#token = options.token;
    this.#fetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.#baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
    this.#userAgent = options.userAgent ?? "github-legends/0.1";
    this.#maxRequests = options.maxRequests;
    this.#maxRetries = options.maxRetries ?? 3;
    this.#baseDelayMs = options.baseDelayMs ?? 1_000;
    this.#maxDelayMs = options.maxDelayMs ?? 30_000;
    this.#maxRateLimitWaitMs = options.maxRateLimitWaitMs ?? 60_000;
    this.#minRemaining = options.minRemaining ?? 25;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.#maxResponseBytes = options.maxResponseBytes ?? 10 * 1024 * 1024;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? Date.now;
    this.#log = options.logger ?? silentLogger;
  }

  get requestsMade(): number {
    return this.#requests;
  }

  get requestsRemaining(): number {
    return this.#maxRequests - this.#requests;
  }

  rateLimit(resource: string): RateLimitState | undefined {
    return this.#rate.get(resource);
  }

  /** One REST request. `route` is a template such as "GET /repos/{owner}/{repo}". */
  async rest<S extends z.ZodType>(
    route: string,
    params: Record<string, QueryValue>,
    schema: S,
  ): Promise<z.output<S>> {
    const { url } = this.#buildUrl(route, params);
    const response = await this.#send(route, "GET", url, undefined);
    return this.#parse(route, response.body, schema);
  }

  /**
   * Follows `Link: rel="next"` up to `maxPages`. The next URL must stay on the API origin,
   * so the token is never sent elsewhere. `complete` is false when pages remain.
   */
  async paginateRest<S extends z.ZodType>(
    route: string,
    params: Record<string, QueryValue>,
    pageSchema: S,
    options: { maxPages: number; selectItems?: (page: z.output<S>) => unknown[] },
  ): Promise<PageResult<unknown>> {
    assertMaxPages(options.maxPages);
    let { url } = this.#buildUrl(route, { per_page: 100, ...params });
    const items: unknown[] = [];
    for (let page = 1; ; page++) {
      const response = await this.#send(route, "GET", url, undefined);
      const parsed = this.#parse(route, response.body, pageSchema);
      const pageItems = options.selectItems ? options.selectItems(parsed) : (parsed as unknown[]);
      if (!Array.isArray(pageItems)) {
        throw new CollectError("invalid_response", "Paginated response is not a list", {
          endpoint: route,
        });
      }
      items.push(...pageItems);
      const next = parseNextLink(response.link);
      if (next === null) return { items, pages: page, complete: true };
      if (!next.startsWith(`${this.#baseUrl}/`)) {
        throw new CollectError(
          "invalid_response",
          "Pagination link points outside the API origin",
          {
            endpoint: route,
          },
        );
      }
      if (page >= options.maxPages) return { items, pages: page, complete: false };
      url = next;
    }
  }

  /** One GraphQL request. Any `errors` entry fails the call: partial data is never returned silently. */
  async graphql<S extends z.ZodType>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
    schema: S,
  ): Promise<z.output<S>> {
    const endpoint = `POST /graphql ${operationName}`;
    const body = JSON.stringify({ query, variables, operationName });
    const response = await this.#send(endpoint, "POST", `${this.#baseUrl}/graphql`, body);
    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new CollectError("invalid_response", "GraphQL response is not JSON", { endpoint });
    }
    const envelope = payload as { data?: unknown; errors?: Array<{ type?: unknown }> };
    if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
      const types = [
        ...new Set(envelope.errors.map((e) => (typeof e.type === "string" ? e.type : "UNKNOWN"))),
      ]
        .filter((t) => /^[A-Z_]{1,40}$/.test(t))
        .sort();
      const kind = types.includes("RATE_LIMITED")
        ? "rate_limited"
        : types.includes("NOT_FOUND")
          ? "not_found"
          : "graphql";
      throw new CollectError(kind, `GraphQL errors: ${types.join(",") || "UNKNOWN"}`, { endpoint });
    }
    return this.#validate(endpoint, envelope.data, schema);
  }

  /** Walks a GraphQL connection with an explicit page cap. */
  async paginateGraphql<N>(
    fetchPage: (after: string | null) => Promise<Connection<N>>,
    maxPages: number,
  ): Promise<PageResult<N> & { endCursor: string | null }> {
    assertMaxPages(maxPages);
    const items: N[] = [];
    let after: string | null = null;
    for (let page = 1; ; page++) {
      const connection: Connection<N> = await fetchPage(after);
      items.push(...connection.nodes);
      after = connection.pageInfo.endCursor;
      if (!connection.pageInfo.hasNextPage) {
        return { items, pages: page, complete: true, endCursor: after };
      }
      if (after === null) {
        throw new CollectError(
          "invalid_response",
          "Connection reports more pages without a cursor",
        );
      }
      if (page >= maxPages) return { items, pages: page, complete: false, endCursor: after };
    }
  }

  #buildUrl(route: string, params: Record<string, QueryValue>): { url: string } {
    const match = ROUTE.exec(route);
    if (!match?.[2]) throw new CollectError("invalid_request", "Malformed route template");
    const rest = { ...params };
    const path = match[2].replace(/\{([a-z_]+)\}/g, (_, name: string) => {
      const value = rest[name];
      delete rest[name];
      if (typeof value !== "string" || !SEGMENT.test(value)) {
        throw new CollectError("invalid_request", `Invalid path parameter "${name}"`, {
          endpoint: route,
        });
      }
      return encodeURIComponent(value);
    });
    const search = new URLSearchParams();
    for (const key of Object.keys(rest).sort()) {
      const value = rest[key];
      if (value !== undefined) search.set(key, String(value));
    }
    const query = search.toString();
    return { url: `${this.#baseUrl}${path}${query ? `?${query}` : ""}` };
  }

  async #send(
    endpoint: string,
    method: string,
    url: string,
    body: string | undefined,
  ): Promise<{ body: string; link: string | null }> {
    for (let attempt = 0; ; attempt++) {
      this.#checkBudget(endpoint);
      this.#requests++;
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": this.#userAgent,
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (this.#token) headers.Authorization = `Bearer ${this.#token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";

      let response: Awaited<ReturnType<FetchLike>>;
      let text: string;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
      try {
        const init: Parameters<FetchLike>[1] = { method, headers, signal: controller.signal };
        if (body !== undefined) init.body = body;
        response = await this.#fetch(url, init);
        text = await response.text();
      } catch {
        const kind = controller.signal.aborted ? "timeout" : "network";
        if (attempt < this.#maxRetries) {
          await this.#backoff(endpoint, attempt, kind);
          continue;
        }
        throw new CollectError(kind, `Request failed after ${attempt + 1} attempts`, {
          endpoint,
          retryable: true,
        });
      } finally {
        clearTimeout(timer);
      }

      this.#recordRateLimit(response.headers);
      if (text.length > this.#maxResponseBytes) {
        throw new CollectError("invalid_response", "Response exceeds the size limit", { endpoint });
      }
      const status = response.status;
      if (status >= 200 && status < 300) return { body: text, link: response.headers.get("link") };

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      const remaining = response.headers.get("x-ratelimit-remaining");
      const isRateLimit =
        status === 429 || (status === 403 && (retryAfterMs !== null || remaining === "0"));
      if (isRateLimit) {
        const waitMs = retryAfterMs ?? this.#untilReset(response.headers);
        if (waitMs !== null && waitMs <= this.#maxRateLimitWaitMs && attempt < this.#maxRetries) {
          this.#log.warn("github.rate_limited.waiting", { endpoint, waitMs, attempt });
          await this.#sleep(waitMs);
          continue;
        }
        throw new CollectError("rate_limited", "Rate limit reached", { endpoint, status });
      }
      if (status >= 500 && attempt < this.#maxRetries) {
        await this.#backoff(endpoint, attempt, `http_${status}`);
        continue;
      }
      throw httpError(endpoint, status);
    }
  }

  #checkBudget(endpoint: string): void {
    if (this.#requests >= this.#maxRequests) {
      throw new CollectError("budget_exhausted", "Request budget for this run is exhausted", {
        endpoint,
      });
    }
    const core = this.#rate.get(endpoint.startsWith("POST /graphql") ? "graphql" : "core");
    if (core && core.remaining <= this.#minRemaining && core.resetAtMs > this.#now()) {
      throw new CollectError("budget_exhausted", "GitHub rate limit reserve reached for this run", {
        endpoint,
      });
    }
  }

  async #backoff(endpoint: string, attempt: number, reason: string): Promise<void> {
    const exp = Math.min(this.#maxDelayMs, this.#baseDelayMs * 2 ** attempt);
    const delay = Math.round(exp / 2 + (exp / 2) * this.#random());
    this.#log.warn("github.retry", { endpoint, attempt: attempt + 1, reason, delayMs: delay });
    await this.#sleep(delay);
  }

  #recordRateLimit(headers: { get(name: string): string | null }): void {
    const limit = Number(headers.get("x-ratelimit-limit"));
    const remaining = Number(headers.get("x-ratelimit-remaining"));
    const reset = Number(headers.get("x-ratelimit-reset"));
    const resource = headers.get("x-ratelimit-resource") ?? "core";
    if (
      Number.isFinite(limit) &&
      Number.isFinite(remaining) &&
      Number.isFinite(reset) &&
      limit > 0
    ) {
      this.#rate.set(resource, { limit, remaining, resetAtMs: reset * 1000 });
    }
  }

  #untilReset(headers: { get(name: string): string | null }): number | null {
    const reset = Number(headers.get("x-ratelimit-reset"));
    if (!Number.isFinite(reset) || reset <= 0) return null;
    return Math.max(0, reset * 1000 - this.#now()) + 1_000;
  }

  #parse<S extends z.ZodType>(endpoint: string, body: string, schema: S): z.output<S> {
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      throw new CollectError("invalid_response", "Response is not JSON", { endpoint });
    }
    return this.#validate(endpoint, data, schema);
  }

  #validate<S extends z.ZodType>(endpoint: string, data: unknown, schema: S): z.output<S> {
    const result = schema.safeParse(data);
    if (!result.success) {
      // Report only the failing paths, never the offending values.
      const paths = result.error.issues
        .slice(0, 5)
        .map((issue) => issue.path.map(String).join(".") || "(root)")
        .join(", ");
      throw new CollectError("invalid_response", `Unexpected response shape at: ${paths}`, {
        endpoint,
      });
    }
    return result.data;
  }
}

function assertMaxPages(maxPages: number): void {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new CollectError("config", "maxPages must be an integer between 1 and 100");
  }
}

export function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function httpError(endpoint: string, status: number): CollectError {
  switch (status) {
    case 401:
      return new CollectError("auth", "Authentication failed", { endpoint, status });
    case 403:
      return new CollectError("forbidden", "Access forbidden", { endpoint, status });
    case 404:
      return new CollectError("not_found", "Resource not found or not accessible", {
        endpoint,
        status,
      });
    case 409:
    case 422:
      return new CollectError("invalid_request", "Request rejected by GitHub", {
        endpoint,
        status,
      });
    default:
      return new CollectError(status >= 500 ? "server" : "invalid_request", `HTTP ${status}`, {
        endpoint,
        status,
        retryable: status >= 500,
      });
  }
}
