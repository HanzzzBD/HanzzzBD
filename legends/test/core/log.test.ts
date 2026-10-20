import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/core/hash.ts";
import { createLogger, sanitizeLogText } from "../../src/core/log.ts";

describe("logger", () => {
  it("neutralises workflow commands, newlines and percent encoding", () => {
    const text = sanitizeLogText("x\n::set-output name=a::b\r%0A::add-mask::y");
    expect(text).not.toContain("\n");
    expect(text).not.toContain("\r");
    expect(text).not.toContain("::");
    expect(text).toContain("%250A");
  });

  it("redacts token-shaped values", () => {
    const sample = `gh${"p"}_${"A".repeat(36)}`;
    expect(sanitizeLogText(`token ${sample} here`)).toBe("token [REDACTED] here");
  });

  it("writes one JSON object per line that never starts with a command", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    log.info("::error::evil", { repo: "a\n::warning::b", count: 2 });
    log.debug("hidden");
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    expect(line.startsWith("{")).toBe(true);
    expect(line).not.toContain("::");
    expect(JSON.parse(line)).toMatchObject({ level: "info", count: 2 });
  });
});

describe("canonicalJson", () => {
  it("sorts keys deeply and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [{ z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[{"y":2,"z":1}]},"b":1}',
    );
  });
});
