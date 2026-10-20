/**
 * Equipment marker files (progression-tables §7). Pure path matching: no file contents are
 * ever read. Used by the collector to keep ONLY marker paths from a repository tree
 * (data minimisation) and by the engine to decide verified equipment.
 *
 * Pattern forms:
 *   "name"        basename glob anywhere in the tree      e.g. "Dockerfile", "vitest.config.*"
 *   "dir/name"    path-suffix glob, segment-aligned       e.g. "nginx/*.conf", "prisma/schema.prisma"
 *   "dir/"        a directory with this path exists       e.g. "database/migrations/"
 * `*` matches within one path segment.
 */
export interface MarkerRule {
  item: string;
  /** At least one of these patterns must match. */
  any: readonly string[];
  /** Every one of these patterns must also match (e.g. Laravel: artisan AND composer.json). */
  all?: readonly string[];
}

export const MARKER_RULES: readonly MarkerRule[] = [
  { item: "github-actions", any: [".github/workflows/*.yml", ".github/workflows/*.yaml"] },
  { item: "docker", any: ["Dockerfile", "*.Dockerfile"] },
  { item: "compose", any: ["compose.yaml", "compose.yml", "docker-compose.yml"] },
  { item: "nginx", any: ["nginx.conf", "nginx/*.conf"] },
  { item: "terraform", any: ["*.tf"] },
  { item: "kubernetes", any: ["Chart.yaml", "kustomization.yaml"] },
  { item: "pnpm", any: ["pnpm-lock.yaml"] },
  { item: "npm", any: ["package-lock.json"] },
  { item: "yarn", any: ["yarn.lock"] },
  { item: "bun", any: ["bun.lockb", "bun.lock"] },
  { item: "composer", any: ["composer.lock"] },
  { item: "poetry-pip", any: ["poetry.lock", "requirements.txt", "pyproject.toml"] },
  { item: "vite", any: ["vite.config.js", "vite.config.ts", "vite.config.mjs"] },
  { item: "prisma", any: ["prisma/schema.prisma", "schema.prisma"] },
  { item: "db-migrations", any: ["database/migrations/", "migrations/", "alembic.ini"] },
  { item: "redis", any: ["redis.conf"] },
  { item: "vitest", any: ["vitest.config.*"] },
  { item: "jest", any: ["jest.config.*"] },
  { item: "phpunit", any: ["phpunit.xml", "phpunit.xml.dist"] },
  { item: "pytest", any: ["pytest.ini", "conftest.py"] },
  { item: "eslint", any: ["eslint.config.*", ".eslintrc*"] },
  { item: "prettier", any: [".prettierrc*", "prettier.config.*"] },
  { item: "laravel", any: ["artisan"], all: ["artisan", "composer.json"] },
  { item: "expo", any: ["eas.json"] },
  { item: "nextjs", any: ["next.config.*"] },
  { item: "tailwind", any: ["tailwind.config.*"] },
  { item: "unity", any: ["ProjectSettings/ProjectVersion.txt"] },
  { item: "godot", any: ["project.godot"] },
];

const VENDORED = new Set(["node_modules", "vendor", "third_party"]);
const MAX_MARKER_PATHS = 500;

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

const compiled = new Map<string, (segments: readonly string[]) => boolean>();

function matcher(pattern: string): (segments: readonly string[]) => boolean {
  const cached = compiled.get(pattern);
  if (cached) return cached;
  let fn: (segments: readonly string[]) => boolean;
  if (pattern.endsWith("/")) {
    const dir = pattern.slice(0, -1).split("/");
    fn = (segments) => {
      const dirs = segments.slice(0, -1);
      for (let i = 0; i + dir.length <= dirs.length; i++) {
        if (dir.every((d, j) => dirs[i + j] === d)) return true;
      }
      return false;
    };
  } else {
    const parts = pattern.split("/").map(globToRegExp);
    fn = (segments) => {
      if (segments.length < parts.length) return false;
      const tail = segments.slice(segments.length - parts.length);
      return parts.every((re, i) => re.test(tail[i] ?? ""));
    };
  }
  compiled.set(pattern, fn);
  return fn;
}

function segmentsOf(path: string): string[] | null {
  if (path.length === 0 || path.length > 1024 || path.startsWith("/") || path.includes("\\"))
    return null;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === ".." || VENDORED.has(s))) return null;
  return segments;
}

/** Keeps only paths that match some marker pattern (sorted, unique, capped). */
export function extractMarkerPaths(paths: Iterable<string>): {
  paths: string[];
  truncated: boolean;
} {
  const patterns = [...new Set(MARKER_RULES.flatMap((r) => [...r.any, ...(r.all ?? [])]))].map(
    matcher,
  );
  const kept = new Set<string>();
  for (const path of paths) {
    const segments = segmentsOf(path);
    if (segments && patterns.some((m) => m(segments))) kept.add(path);
  }
  const sorted = [...kept].sort();
  return { paths: sorted.slice(0, MAX_MARKER_PATHS), truncated: sorted.length > MAX_MARKER_PATHS };
}

/** Item ids whose marker rule is satisfied by the given (repo-relative) paths. */
export function matchMarkerItems(paths: readonly string[]): string[] {
  const segmentLists = paths.map(segmentsOf).filter((s): s is string[] => s !== null);
  const hit = (pattern: string) => segmentLists.some((s) => matcher(pattern)(s));
  return MARKER_RULES.filter((r) => r.any.some(hit) && (r.all ?? []).every(hit))
    .map((r) => r.item)
    .sort();
}
