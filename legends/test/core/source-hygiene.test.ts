import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory()
      ? files(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });

describe("source hygiene", () => {
  it("contains no invisible or bidirectional control characters (write \\u escapes instead)", () => {
    const hidden = /[\u200B-\u200F\u202A-\u202E\u2028\u2029\u2066-\u2069\uFEFF]/u;
    const offenders = ["src", "test", "scripts"]
      .flatMap(files)
      .filter((f) => hidden.test(readFileSync(join(root, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
