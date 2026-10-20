/**
 * A synthetic seven-week player (SAMPLE DATA) run through the real engine. Logins, repos and
 * people are invented; nothing here describes a real account.
 */

import type { EngineOutput } from "../../src/engine/engine.ts";
import { runEngine } from "../../src/engine/engine.ts";
import { addDays } from "../../src/engine/time.ts";
import type { NormalizedEvent } from "../../src/normalize/event.ts";
import type { ProfileInput } from "../../src/render/readme/model.ts";
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
  release,
  resetCounter,
  review,
  snapshot,
  wib,
  workflowRun,
} from "../helpers/events.ts";

export const SAMPLE_RUN_AT = "2026-11-16T17:17:00Z"; // 17 Nov 2026, 00:17 WIB

function calendarDay(date: string, count: number): NormalizedEvent<"contribution_day"> {
  return {
    key: `cal:${date}`,
    type: "contribution_day",
    rev: 1,
    repo: null,
    actor: null,
    occurredAt: `${date}T00:00:00Z`,
    firstSeenAt: `${date}T00:00:00Z`,
    metadata: { date, count },
    provenance: { sources: ["calendar"], api: "graphql", collectorVersion: "1" },
    verification: { status: "partial", notes: ["calendar_timezone_unconfirmed"] },
  };
}

export function sampleEvents(): AnyEvent[] {
  resetCounter();
  const events: AnyEvent[] = [
    snapshot(OWN, "2026-09-25", { TypeScript: 6000, PHP: 2500, Python: 1500 }),
    snapshot(OWN2, "2026-09-25", { Python: 5000, JavaScript: 2000 }),
    snapshot(EXT, "2026-09-25", { Go: 4000, TypeScript: 1000 }),
    markers(OWN, "2026-09-25", [
      "Dockerfile",
      "docker-compose.yml",
      "nginx.conf",
      ".github/workflows/ci.yml",
      "vitest.config.ts",
    ]),
  ];
  for (let d = 0; d < 47; d++) {
    const day = addDays("2026-10-01", d);
    if (d % 7 === 5) continue; // one rest day a week
    const n = 3 + ((d * 7) % 5);
    const repo = d % 3 === 2 ? OWN2 : OWN;
    events.push(
      ...commitsOn(
        day,
        n,
        { repo },
        `${String(9 + (d % 8)).padStart(2, "0")}:${String((d * 13) % 60).padStart(2, "0")}`,
      ),
    );
    events.push(calendarDay(day, n));
    if (d % 2 === 0) events.push(workflowRun(OWN, wib(day, "21:00"), { id: `R${d}` }));
    if (d % 5 === 1) events.push(pr({ id: `own-${d}`, mergedAt: wib(day, "20:00"), repo }));
    if (d % 7 === 3)
      events.push(
        pr({
          id: `ext-${d}`,
          mergedAt: wib(day, "19:00"),
          repo: EXT,
          approvers: [{ id: 2001 + (d % 4), accountCreatedAt: "2019-01-01T00:00:00Z" }],
        }),
      );
    if (d % 4 === 2)
      events.push(
        review({
          at: wib(day, "18:00"),
          prAuthor: HUMAN(2001 + (d % 6)),
          repo: EXT,
          id: `rv-${d}`,
        }),
      );
    if (d % 9 === 4)
      events.push(
        issue({
          createdAt: wib(addDays(day, -2), "10:00"),
          closedAt: wib(day, "16:00"),
          author: HUMAN(2010 + d),
          closedByPlayer: true,
          repo: OWN,
          id: `is-${d}`,
        }),
      );
    if (d % 20 === 10) events.push(release({ at: wib(day, "22:00"), repo: OWN, id: `rel-${d}` }));
  }
  return events;
}

export function sampleOutput(): EngineOutput {
  return runEngine({
    config: {
      ...CONFIG,
      playerId: 7,
      heroes: { main: "syntaria" },
      build: ["docker", "compose", "nginx", "github-actions", "vitest"],
      declaredTools: ["unity", "blender"],
    },
    events: sampleEvents(),
    ledger: [],
    runAt: SAMPLE_RUN_AT,
    closureAllowed: true,
  });
}

export function sampleProfileInput(extra: Partial<ProfileInput> = {}): ProfileInput {
  const events = sampleEvents();
  return {
    output: sampleOutput(),
    config: { login: "sample-player", displayName: "Sample Player", enable: ["squad"] },
    lastSuccessfulRefresh: SAMPLE_RUN_AT,
    calendar: events
      .filter((e): e is NormalizedEvent<"contribution_day"> => e.type === "contribution_day")
      .map((e) => e.metadata),
    sample: true,
    ...extra,
  };
}
