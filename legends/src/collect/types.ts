import { CollectError, type SafeError, toSafeError } from "../core/errors.ts";
import type { Logger } from "../core/log.ts";
import type { GitHubClient } from "../github/client.ts";
import type { AnyEvent, RepoRef, SourceId } from "../normalize/event.ts";
import type { NormalizeContext, PlayerIdentity } from "../normalize/normalizers.ts";
import type { RepoFacts } from "../normalize/privacy.ts";
import type { CollectionConfig } from "./config.ts";
import type { RepoFilter } from "./scope.ts";

export type SourceStatus = "complete" | "partial" | "failed" | "skipped";

export interface ScopedRepo {
  facts: RepoFacts;
  ref: RepoRef;
  defaultBranch: string | null;
  pushedAt: string | null;
}

/** A failure for one unit of work. `unit` is a repo pseudonym or a window id, never a private name. */
export interface UnitIssue {
  unit: string;
  error: SafeError;
}

export interface SourceReport {
  source: SourceId;
  status: SourceStatus;
  events: AnyEvent[];
  unitsTotal: number;
  unitsComplete: number;
  /** Units whose pagination stopped at the page cap: data for them is incomplete. */
  truncatedUnits: string[];
  issues: UnitIssue[];
  /** Records skipped because they belong to private repos that are not authorised. Count only. */
  droppedPrivate: number;
}

export interface CollectContext {
  client: GitHubClient;
  config: CollectionConfig;
  player: PlayerIdentity;
  normalize: NormalizeContext;
  filter: RepoFilter;
  runAt: string;
  since: string;
  logger: Logger;
}

export interface UnitOutcome {
  events: AnyEvent[];
  complete: boolean;
  droppedPrivate?: number;
}

/**
 * Runs units one at a time (secondary rate limits favour sequential requests). Per-unit
 * failures are recorded and the source continues; an exhausted budget stops the source
 * and marks every remaining unit as not collected. Incomplete data is never reported as complete.
 */
export async function runUnits<U>(
  source: SourceId,
  units: readonly U[],
  unitId: (unit: U) => string,
  work: (unit: U) => Promise<UnitOutcome>,
  logger: Logger,
): Promise<SourceReport> {
  const report: SourceReport = {
    source,
    status: "complete",
    events: [],
    unitsTotal: units.length,
    unitsComplete: 0,
    truncatedUnits: [],
    issues: [],
    droppedPrivate: 0,
  };
  for (let i = 0; i < units.length; i++) {
    const unit = units[i] as U;
    const id = unitId(unit);
    try {
      const outcome = await work(unit);
      report.events.push(...outcome.events);
      report.droppedPrivate += outcome.droppedPrivate ?? 0;
      if (outcome.complete) report.unitsComplete++;
      else report.truncatedUnits.push(id);
    } catch (error) {
      const safe = toSafeError(error);
      report.issues.push({ unit: id, error: safe });
      logger.warn("collect.unit_failed", {
        source,
        unit: id,
        kind: safe.kind,
        status: safe.status,
      });
      if (error instanceof CollectError && error.kind === "budget_exhausted") {
        for (const rest of units.slice(i + 1)) {
          report.issues.push({ unit: unitId(rest), error: safe });
        }
        break;
      }
    }
  }
  report.status = statusOf(report);
  return report;
}

export function statusOf(
  report: Pick<SourceReport, "unitsTotal" | "unitsComplete" | "issues" | "truncatedUnits">,
): SourceStatus {
  if (report.unitsTotal === 0) return "complete";
  if (report.unitsComplete === report.unitsTotal && report.issues.length === 0) return "complete";
  if (report.unitsComplete === 0 && report.truncatedUnits.length === 0) return "failed";
  return "partial";
}

export function skippedReport(source: SourceId): SourceReport {
  return {
    source,
    status: "skipped",
    events: [],
    unitsTotal: 0,
    unitsComplete: 0,
    truncatedUnits: [],
    issues: [],
    droppedPrivate: 0,
  };
}

/** Splits [since, until) into windows GitHub accepts for contributionsCollection (≤ 1 year). */
export function yearWindows(since: string, until: string): Array<{ from: string; to: string }> {
  const span = 364 * 86_400_000;
  const end = Date.parse(until);
  const windows: Array<{ from: string; to: string }> = [];
  for (let from = Date.parse(since); from < end; from += span) {
    windows.push({
      from: new Date(from).toISOString().replace(".000Z", "Z"),
      to: new Date(Math.min(from + span, end)).toISOString().replace(".000Z", "Z"),
    });
  }
  return windows;
}
