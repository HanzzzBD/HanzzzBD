/**
 * Error taxonomy for the collection layer.
 *
 * Messages are composed by this code only. They never contain tokens, full URLs,
 * response bodies, or values from private repositories. `endpoint` is always a
 * route template (for example "GET /repos/{owner}/{repo}/languages"), never an
 * expanded URL.
 */
export type CollectErrorKind =
  | "auth"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "server"
  | "network"
  | "timeout"
  | "invalid_request"
  | "invalid_response"
  | "graphql"
  | "budget_exhausted"
  | "config"
  | "not_authorized_private";

export interface SafeError {
  kind: CollectErrorKind;
  message: string;
  endpoint?: string;
  status?: number;
  retryable: boolean;
}

export class CollectError extends Error {
  readonly kind: CollectErrorKind;
  readonly endpoint: string | undefined;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    kind: CollectErrorKind,
    message: string,
    options: { endpoint?: string; status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "CollectError";
    this.kind = kind;
    this.endpoint = options.endpoint;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }

  toSafe(): SafeError {
    const safe: SafeError = { kind: this.kind, message: this.message, retryable: this.retryable };
    if (this.endpoint !== undefined) safe.endpoint = this.endpoint;
    if (this.status !== undefined) safe.status = this.status;
    return safe;
  }
}

/** Converts any thrown value into a SafeError without leaking its message. */
export function toSafeError(error: unknown): SafeError {
  if (error instanceof CollectError) return error.toSafe();
  return { kind: "network", message: "Unexpected error during collection", retryable: false };
}
