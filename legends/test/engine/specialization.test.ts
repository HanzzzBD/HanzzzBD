import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { type EngineInput, runEngine } from "../../src/engine/engine.ts";
import { DOMAIN_WEIGHTS, EMBLEM_LEVELS, emblemLevelFor } from "../../src/engine/heroes/emblems.ts";
import { ITEMS } from "../../src/engine/heroes/equipment.ts";
import { emblemPanel, equipmentPanel } from "../../src/engine/heroes/presentation.ts";
import type { RepoRef } from "../../src/normalize/event.ts";
import { extractMarkerPaths, MARKER_RULES, matchMarkerItems } from "../../src/normalize/markers.ts";
import {
  type AnyEvent,
  CONFIG,
  commitsOn,
  EXT,
  HUMAN,
  issue,
  markers,
  OWN,
  OWN2,
  pr,
  resetCounter,
  review,
  snapshot,
  wib,
  workflowRun,
} from "../helpers/events.ts";

const tables = readFileSync(
  fileURLToPath(new URL("../../../docs/game-design/progression-tables.md", import.meta.url)),
  "utf8",
);
const RUN = "2026-10-25T00:00:00Z";
const run = (events: AnyEvent[], extra: Partial<EngineInput> = {}) =>
  runEngine({ config: CONFIG, events, ledger: [], runAt: RUN, closureAllowed: true, ...extra });
const emblem = (out: ReturnType<typeof run>, id: string) =>
  out.specialization.emblems.emblems.find((e) => e.id === id);
const item = (out: ReturnType<typeof run>, id: string) =>
  out.specialization.equipment.items.find((i) => i.id === id);

/** Commits across several days with varied times (≥ 5 per repo so repos are eligible). */
function work(repo: RepoRef, days: number, perDay = 10, startDay = 1): AnyEvent[] {
  return Array.from({ length: days }, (_, i) =>
    commitsOn(
      `2026-10-${String(startDay + i).padStart(2, "0")}`,
      perDay,
      { repo },
      `${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 17) % 60).padStart(2, "0")}`,
    ),
  ).flat();
}

beforeEach(resetCounter);

describe("emblem tables (progression-tables §5, GDD §D.2)", () => {
  it("matches the level table and level boundaries", () => {
    const section = tables.slice(tables.indexOf("## 5. Emblem levels"), tables.indexOf("## 6."));
    const rows = section
      .split("\n")
      .filter((l) => /^\| \d+ \|/.test(l))
      .map((l) =>
        l
          .split("|")
          .slice(1, 4)
          .map((c) => c.trim()),
      );
    expect(
      rows.map(([lvl, ep, bp]) => [Number(lvl), Number(ep?.replace(/,/g, "")), Number(bp)]),
    ).toEqual(EMBLEM_LEVELS.map((ep, i) => [i + 1, ep, 20 * (i + 1)]));
    EMBLEM_LEVELS.forEach((ep, i) => {
      expect(emblemLevelFor(ep)).toBe(i + 1);
      expect(emblemLevelFor(ep - 1)).toBe(i);
    });
  });

  it("uses the approved domain weights", () => {
    expect(DOMAIN_WEIGHTS.TypeScript).toEqual({ fe: 60, be: 40 });
    expect(DOMAIN_WEIGHTS.Python).toEqual({ be: 50, ai: 50 });
    expect(DOMAIN_WEIGHTS.Blade).toEqual({ fe: 50, be: 50 });
    expect(DOMAIN_WEIGHTS.Lua).toBeUndefined();
  });
});

describe("emblem progression", () => {
  it("routes commit EXP into domains by repo language weights; Full-stack = 2 × min(FE, BE)", () => {
    const out = run([...work(OWN, 14), snapshot(OWN, "2026-09-30", { TypeScript: 1000 })]); // 14 × 75 = 1,050 EXP
    expect(emblem(out, "frontend")).toMatchObject({ ep: 630, level: 2 });
    expect(emblem(out, "backend")).toMatchObject({ ep: 420, level: 2 });
    expect(emblem(out, "fullstack")).toMatchObject({ ep: 840, level: 2 });
    expect(emblem(out, "ai_ml")).toMatchObject({ ep: 0, level: 0, owned: false });
    expect(
      out.ledger.filter((e) => e.rule === "bp.emblem_level").map((e) => [e.meta?.emblem, e.amount]),
    ).toEqual([
      ["frontend", 20],
      ["frontend", 40],
      ["backend", 20],
      ["backend", 40],
      ["fullstack", 20],
      ["fullstack", 40],
    ]);
  });

  it("excludes C# from domains in game projects (Unity/Godot marker)", () => {
    const events = [...work(OWN, 4), snapshot(OWN, "2026-09-30", { "C#": 900, ShaderLab: 100 })];
    expect(emblem(run(events), "backend")?.ep).toBe(270);
    expect(
      emblem(
        run([...events, markers(OWN, "2026-09-30", ["ProjectSettings/ProjectVersion.txt"])]),
        "backend",
      )?.ep,
    ).toBe(0);
  });

  it("adds DevOps EP per day with a player-triggered successful push run in an owned repo", () => {
    const out = run([
      workflowRun(OWN, wib("2026-10-10")),
      workflowRun(OWN, wib("2026-10-10", "15:00")),
      workflowRun(OWN, wib("2026-10-11")),
      workflowRun(OWN, wib("2026-10-12"), { bot: true }),
      workflowRun(OWN, wib("2026-10-13"), { event: "schedule" }),
      workflowRun(OWN, wib("2026-10-14"), { conclusion: "failure" }),
      workflowRun(EXT, wib("2026-10-15")),
    ]);
    expect(emblem(out, "devops")).toMatchObject({
      ep: 10,
      sources: { commits: 0, workflowRunDays: 10 },
    });
  });

  it("gives Open Source EP for external merges, reviews and external issues resolved", () => {
    const out = run([
      pr({ mergedAt: wib("2026-10-10"), repo: EXT }),
      pr({ mergedAt: wib("2026-10-11") }), // own repo: not Open Source
      review({ at: wib("2026-10-12"), prAuthor: HUMAN() }),
      issue({
        createdAt: wib("2026-10-01"),
        closedAt: wib("2026-10-05"),
        repo: EXT,
        closedByPlayer: false,
      }),
    ]);
    expect(emblem(out, "open_source")).toMatchObject({
      ep: 100,
      level: 1,
      sources: { mergesAndReviews: 85, externalIssues: 15 },
    });
  });

  it("activates the configured emblem with a free first attunement and applies its BP bonus", () => {
    const history = [...work(OWN, 14), snapshot(OWN, "2026-09-30", { Go: 1000 })];
    const cfg = { ...CONFIG, emblem: { active: "backend" } };
    const out = run(history, { config: cfg, runAt: "2026-10-20T00:00:00Z" });
    expect(
      out.ledger
        .filter((e) => e.rule.startsWith("emblem.") && e.rule !== "emblem.level")
        .map((e) => [e.rule, e.meta?.emblem]),
    ).toEqual([
      ["emblem.attune", "backend"],
      ["emblem.activate", "backend"],
    ]);
    const later = run([...history, ...work(OWN, 1, 10, 22)], {
      config: cfg,
      runAt: "2026-10-25T00:00:00Z",
      ledger: out.ledger,
    });
    // Commits on 2026-10-22: 10 EXP → floor(2 × 1.15) = 2; 5 EXP → floor(1 × 1.15) = 1 (the bonus rounds away at small values).
    expect(later.specialization.emblems.active).toBe("backend");
    expect(
      later.newEntries
        .filter((e) => e.rule === "bp.activity")
        .map((e) => e.amount)
        .sort(),
    ).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  });

  it("rejects events observed after the run (impossible store input)", () => {
    const out = run(commitsOn("2026-10-26", 3), { runAt: "2026-10-25T00:00:00Z" });
    expect(out.newEntries).toEqual([]);
    expect(out.diagnostics.find((d) => d.code === "first_seen_after_run")?.count).toBe(3);
  });

  it("applies floor(12 × 1.15) = 13 for an external merge with Open Source active (AC-SYS07-01)", () => {
    const seed = run(
      [
        pr({ mergedAt: wib("2026-10-02"), repo: EXT }),
        pr({ mergedAt: wib("2026-10-03"), repo: EXT }),
      ],
      { runAt: "2026-10-05T00:00:00Z" },
    );
    const active = run([], {
      config: { ...CONFIG, emblem: { active: "open_source" } },
      runAt: "2026-10-06T00:00:00Z",
      ledger: seed.ledger,
    });
    const bonus = run([pr({ id: "PR_new", mergedAt: wib("2026-10-08"), repo: EXT })], {
      config: { ...CONFIG, emblem: { active: "open_source" } },
      runAt: "2026-10-09T00:00:00Z",
      ledger: active.ledger,
    });
    expect(bonus.newEntries.find((e) => e.rule === "bp.activity")?.amount).toBe(13);
  });

  it("refuses unowned emblems, enforces the 7-day cooldown and charges further attunements (shop pending)", () => {
    const base = [...work(OWN, 2), snapshot(OWN, "2026-09-30", { Go: 1000, SQL: 1 })];
    const notOwned = run(base, { config: { ...CONFIG, emblem: { active: "ai_ml" } } });
    expect(notOwned.specialization.emblems.active).toBeNull();
    expect(notOwned.diagnostics.find((d) => d.code === "emblem_not_owned")?.count).toBe(1);
    const first = run(base, {
      config: { ...CONFIG, emblem: { active: "backend" } },
      runAt: "2026-10-10T00:00:00Z",
    });
    const tooSoon = run(base, {
      config: { ...CONFIG, emblem: { active: "fullstack" } },
      runAt: "2026-10-12T00:00:00Z",
      ledger: first.ledger,
    });
    expect(tooSoon.diagnostics.find((d) => d.code === "emblem_cooldown")?.count).toBe(1);
    expect(tooSoon.specialization.emblems).toMatchObject({
      active: "backend",
      changeableFrom: "2026-10-17",
    });
    const fullstackOwned = run([...base, snapshot(OWN, "2026-09-29", { TypeScript: 1000 })], {
      config: { ...CONFIG, emblem: { active: "frontend" } },
      runAt: "2026-10-18T00:00:00Z",
      ledger: first.ledger,
    });
    expect(
      fullstackOwned.diagnostics.find(
        (d) => d.code === "emblem_not_attuned" || d.code === "emblem_not_owned",
      ),
    ).toBeDefined();
    expect(fullstackOwned.specialization.emblems.active).toBe("backend");
  });

  it("builds an emblem panel with progress and provenance", () => {
    const out = run([...work(OWN, 14), snapshot(OWN, "2026-09-30", { TypeScript: 1000 })]);
    const panel = emblemPanel(out.specialization.emblems);
    expect(panel.emblems.find((e) => e.id === "frontend")).toMatchObject({
      ep: 630,
      level: 2,
      indicator: { percent: 38, next: 1000 },
      provenance: "derived",
      suggested: false,
    });
    expect(panel.emblems.filter((e) => e.suggested).map((e) => e.id)).toEqual(["fullstack"]);
    expect(panel.active).toBeNull();
  });
});

describe("markers (progression-tables §7)", () => {
  it("covers every item in the table with a rule", () => {
    expect(MARKER_RULES.map((r) => r.item).sort()).toEqual(ITEMS.map((i) => i.id).sort());
  });

  it("keeps only marker paths, ignoring vendored and unsafe paths", () => {
    const { paths } = extractMarkerPaths([
      "src/index.ts",
      "Dockerfile",
      "node_modules/foo/Dockerfile",
      "vendor/x/composer.lock",
      "../etc/passwd",
      "apps/web/vite.config.ts",
      ".github/workflows/ci.yml",
      "docs/README.md",
      "database/migrations/2026_01_01.php",
    ]);
    expect(paths).toEqual([
      ".github/workflows/ci.yml",
      "Dockerfile",
      "apps/web/vite.config.ts",
      "database/migrations/2026_01_01.php",
    ]);
  });

  it("matches items, including all-of rules", () => {
    expect(matchMarkerItems(["artisan"])).toEqual([]);
    expect(matchMarkerItems(["artisan", "composer.json", "composer.lock"])).toEqual([
      "composer",
      "laravel",
    ]);
    expect(
      matchMarkerItems([
        "infra/main.tf",
        "ops/nginx/site.conf",
        "api.Dockerfile",
        ".eslintrc.cjs",
        "prisma/schema.prisma",
      ]),
    ).toEqual(["docker", "eslint", "nginx", "prisma", "terraform"]);
    expect(matchMarkerItems(["nginx.conf.bak", "my-migrations.txt"])).toEqual([]);
  });
});

describe("equipment", () => {
  const repos: RepoRef[] = Array.from({ length: 10 }, (_, i) => ({
    id: `gh:${100 + i}`,
    visibility: "public",
    fullName: `sample-player/r${i}`,
    ownedByPlayer: true,
    isFork: false,
    isArchived: false,
  }));

  it("verifies items only in eligible repos (≥ 5 qualifying commits) and tiers them 1/3/6/10", () => {
    const events: AnyEvent[] = [];
    repos.forEach((repo, i) => {
      events.push(
        ...commitsOn(
          `2026-10-${String(1 + i).padStart(2, "0")}`,
          5,
          { repo },
          `${String(8 + i).padStart(2, "0")}:07`,
        ),
      );
      events.push(
        markers(repo, "2026-10-20", [
          "Dockerfile",
          ...(i < 3 ? ["pnpm-lock.yaml"] : []),
          ...(i < 6 ? ["vitest.config.ts"] : []),
        ]),
      );
    });
    events.push(
      markers(OWN2, "2026-10-20", ["yarn.lock"]),
      ...commitsOn("2026-10-15", 4, { repo: OWN2 }, "21:00"),
    );
    const out = run(events);
    expect([
      item(out, "docker")?.tier,
      item(out, "vitest")?.tier,
      item(out, "pnpm")?.tier,
      item(out, "yarn")?.state,
    ]).toEqual(["legendary", "epic", "rare", "none"]);
    expect(
      out.ledger
        .filter((e) => e.rule === "bp.equipment_tier")
        .map((e) => [e.meta?.item, e.meta?.tier, e.amount]),
    ).toEqual([
      ["docker", "rare", 20],
      ["docker", "epic", 50],
      ["docker", "legendary", 100],
      ["pnpm", "rare", 20],
      ["vitest", "rare", 20],
      ["vitest", "epic", 50],
    ]);
  });

  it("requires a recent sighting for Legendary and never lowers a recorded tier", () => {
    const events: AnyEvent[] = [];
    repos.forEach((repo, i) => {
      events.push(
        ...commitsOn(
          `2026-06-${String(1 + i).padStart(2, "0")}`,
          5,
          { repo },
          `${String(8 + i).padStart(2, "0")}:07`,
        ),
      );
      events.push(markers(repo, "2026-06-20", ["Dockerfile"]));
    });
    const stale = run(events);
    expect(item(stale, "docker")?.tier).toBe("epic");
    const recent = run(
      events.map((e) =>
        e.type === "repo_markers" ? markers(e.repo as RepoRef, "2026-10-01", ["Dockerfile"]) : e,
      ),
    );
    expect(item(recent, "docker")?.tier).toBe("legendary");
    const afterRemoval = run(
      events.filter((e) => e.type !== "repo_markers"),
      { ledger: recent.ledger },
    );
    expect(item(afterRemoval, "docker")).toMatchObject({
      tier: "legendary",
      state: "verified",
      verifiedRepos: 0,
    });
  });

  it("needs a successful player push run for GitHub Actions, not just a workflow file", () => {
    const base = [
      ...commitsOn("2026-10-10", 5),
      markers(OWN, "2026-10-20", [".github/workflows/ci.yml"]),
    ];
    expect(item(run(base), "github-actions")?.state).toBe("none");
    expect(
      item(run([...base, workflowRun(OWN, wib("2026-10-11"), { bot: true })]), "github-actions")
        ?.state,
    ).toBe("none");
    expect(
      item(run([...base, workflowRun(OWN, wib("2026-10-11"))]), "github-actions"),
    ).toMatchObject({ state: "verified", tier: "common", evidence: ["marker", "workflow_run"] });
  });

  it("treats topics as tagged (weak) evidence and declarations as self-declared only", () => {
    const out = run(
      [
        ...commitsOn("2026-10-10", 5),
        snapshot(OWN, "2026-10-20", { TypeScript: 10 }, ["docker", "unity"]),
      ],
      {
        config: { ...CONFIG, declaredTools: ["unity", "blender", "Bad Id!"] },
      },
    );
    expect(item(out, "docker")).toMatchObject({
      state: "tagged",
      tier: null,
      taggedRepos: 1,
      evidence: ["topic"],
    });
    const panel = equipmentPanel(out.specialization.equipment);
    expect(panel.declaredKit).toEqual([
      { id: "unity", name: "Unity", provenance: "self_declared" },
      { id: "blender", name: "blender", provenance: "self_declared" },
    ]);
    expect(out.ledger.filter((e) => e.rule === "bp.equipment_tier")).toEqual([]);
    expect(panel.notes.some((n) => /not proficiency/.test(n))).toBe(true);
  });

  it("validates the build: verified items, one tagged, one Boots, five slots", () => {
    const events = [
      ...commitsOn("2026-10-10", 5),
      markers(OWN, "2026-10-20", [
        ".github/workflows/ci.yml",
        "Dockerfile",
        "pnpm-lock.yaml",
        "vitest.config.ts",
        "eslint.config.js",
        "tailwind.config.ts",
      ]),
      workflowRun(OWN, wib("2026-10-11")),
      snapshot(OWN, "2026-10-20", { TypeScript: 10 }, ["nginx", "redis"]),
    ];
    const out = run(events, {
      config: {
        ...CONFIG,
        build: [
          "github-actions",
          "github-actions",
          "nginx",
          "redis",
          "kubernetes",
          "nope",
          "docker",
          "pnpm",
          "vitest",
          "eslint",
        ],
      },
    });
    const panel = equipmentPanel(out.specialization.equipment);
    expect(panel.build.map((s) => s.item && [s.item.id, s.item.tagged])).toEqual([
      ["github-actions", false],
      ["nginx", true],
      ["docker", false],
      ["pnpm", false],
      ["vitest", false],
    ]);
    const codes = Object.fromEntries(out.diagnostics.map((d) => [d.code, d.count]));
    expect(codes).toMatchObject({
      tagged_slot_taken: 1,
      item_not_owned: 1,
      unknown_item: 1,
      build_full: 1,
    });
  });

  it("reports when marker data has not been collected yet", () => {
    const panel = equipmentPanel(run(commitsOn("2026-10-10", 5)).specialization.equipment);
    expect(panel.notes.some((n) => /not been collected/.test(n))).toBe(true);
    expect(panel.build.every((s) => s.item === null)).toBe(true);
  });
});
