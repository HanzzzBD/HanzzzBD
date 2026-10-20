/**
 * Structured logger that is safe to run inside GitHub Actions.
 *
 * GitHub Actions interprets stdout lines that start with `::` as workflow commands
 * (for example `::add-mask::`, `::stop-commands::`). Every line written here is a
 * JSON object, so it starts with `{`. In addition, string values are escaped so
 * no `::` sequence, carriage return or newline survives, and token-shaped values
 * are redacted.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const TOKEN_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

export function sanitizeLogText(value: string): string {
  return value
    .replace(TOKEN_PATTERN, "[REDACTED]")
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/::/g, ":\u200B:")
    .slice(0, 500);
}

export function createLogger(write: (line: string) => void, minLevel: LogLevel = "info"): Logger {
  const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const emit = (level: LogLevel, event: string, fields: LogFields = {}) => {
    if (order[level] < order[minLevel]) return;
    const record: Record<string, string | number | boolean | null> = {
      level,
      event: sanitizeLogText(event),
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      record[sanitizeLogText(key)] = typeof value === "string" ? sanitizeLogText(value) : value;
    }
    write(JSON.stringify(record));
  };
  return {
    debug: (e, f) => emit("debug", e, f),
    info: (e, f) => emit("info", e, f),
    warn: (e, f) => emit("warn", e, f),
    error: (e, f) => emit("error", e, f),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
