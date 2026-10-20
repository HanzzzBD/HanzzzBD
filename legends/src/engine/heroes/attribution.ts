/**
 * Technology attribution shared by hero mastery and emblems.
 *
 * Language statistics are INDICATORS of technology usage, not proof of expertise:
 *  - Only commit EXP that already passed qualification (bots, spam, duplicates, automation
 *    removed) is distributed.
 *  - Each award is split by the byte shares of the repository's language snapshot that
 *    existed when the award was made (historical stability). Awards older than the first
 *    snapshot use the earliest snapshot and are marked `approximate` (GDD §C.6).
 *  - Private repositories, forks and excluded repositories contribute nothing (D-02).
 * All arithmetic is integer ("milli-points") so results never depend on float order.
 */
import type { AnyEvent, NormalizedEvent, RepoRef } from "../../normalize/event.ts";
import type { LedgerEntry } from "../ledger.ts";
import { type Diagnostics, type EngineConfig, repoListed } from "../qualify.ts";
import { dayOf, parseInstant } from "../time.ts";

export interface CommitCredit {
  entryId: string;
  repo: RepoRef;
  exp: number;
  eventDay: string;
  /** Language bytes of the snapshot used for this award; null when the repo has no snapshot. */
  languages: Readonly<Record<string, number>> | null;
  totalBytes: number;
  approximate: boolean;
}

export interface RepoFacts {
  repo: RepoRef;
  /** Qualifying commits (every exp.commit entry, including capped ones). */
  qualifyingCommits: number;
  /** Latest language snapshot (current shares). */
  latestLanguages: Readonly<Record<string, number>> | null;
  latestTopics: readonly string[];
  /** Latest marker paths (equipment), if the tree was collected. */
  markerPaths: readonly string[] | null;
  markersObservedOn: string | null;
}

export interface Attribution {
  credits: CommitCredit[];
  repos: Map<string, RepoFacts>;
}

export function eventKeyOf(subject: string): string {
  const at = subject.lastIndexOf("@");
  return at > 0 ? subject.slice(0, at) : subject;
}

/** Repo of a commit key when the event itself is gone: "commit:<repoId>:<sha>". */
function repoFromCommitKey(key: string): RepoRef | null {
  const match = /^commit:(gh:\d+):[^:]+$/.exec(key);
  if (!match?.[1]) return null;
  return {
    id: match[1],
    visibility: "public",
    ownedByPlayer: false,
    isFork: false,
    isArchived: false,
  };
}

export function creditableRepo(repo: RepoRef | null, config: EngineConfig): repo is RepoRef {
  return (
    repo !== null &&
    repo.visibility === "public" &&
    !repo.isFork &&
    !repoListed(repo, config.excludeRepos)
  );
}

export function attribute(
  ledger: readonly LedgerEntry[],
  events: ReadonlyMap<string, AnyEvent>,
  config: EngineConfig,
  diagnostics: Diagnostics,
): Attribution {
  const snapshots = new Map<string, NormalizedEvent<"repo_snapshot">[]>();
  const markers = new Map<string, NormalizedEvent<"repo_markers">>();
  for (const event of events.values()) {
    if (event.type === "repo_snapshot" && event.repo) {
      const list = snapshots.get(event.repo.id) ?? [];
      list.push(event);
      snapshots.set(event.repo.id, list);
    } else if (event.type === "repo_markers" && event.repo) {
      const current = markers.get(event.repo.id);
      if (!current || event.metadata.observedOn > current.metadata.observedOn)
        markers.set(event.repo.id, event);
    }
  }
  for (const list of snapshots.values()) {
    list.sort((a, b) =>
      a.metadata.observedOn < b.metadata.observedOn
        ? -1
        : a.metadata.observedOn > b.metadata.observedOn
          ? 1
          : 0,
    );
  }

  const credits: CommitCredit[] = [];
  const repos = new Map<string, RepoFacts>();
  const commitEntries = ledger
    .filter((e) => e.rule === "exp.commit")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const entry of commitEntries) {
    const key = eventKeyOf(entry.subject[0] ?? "");
    const event = events.get(key);
    const repo = event?.repo ?? repoFromCommitKey(key);
    if (!creditableRepo(repo, config)) continue;
    const facts =
      repos.get(repo.id) ?? factsFor(repo, snapshots.get(repo.id) ?? [], markers.get(repo.id));
    facts.qualifyingCommits++;
    repos.set(repo.id, facts);
    if (entry.amount <= 0) continue;

    const awardMs = parseInstant(entry.createdAt);
    const awardDay = awardMs === null ? "9999-12-31" : dayOf(awardMs, config.timezone);
    const list = snapshots.get(repo.id) ?? [];
    let snapshot: NormalizedEvent<"repo_snapshot"> | undefined;
    for (const s of list) if (s.metadata.observedOn <= awardDay) snapshot = s;
    const approximate = snapshot === undefined && list.length > 0;
    snapshot ??= list[0];
    if (!snapshot) diagnostics.add("no_language_snapshot", repo.id);
    const languages = snapshot?.metadata.languages ?? null;
    const totalBytes = languages ? Object.values(languages).reduce((s, b) => s + b, 0) : 0;
    credits.push({
      entryId: entry.id,
      repo,
      exp: entry.amount,
      eventDay: entry.eventDay ?? awardDay,
      languages: totalBytes > 0 ? languages : null,
      totalBytes,
      approximate,
    });
  }
  return { credits, repos };
}

function factsFor(
  repo: RepoRef,
  snapshots: readonly NormalizedEvent<"repo_snapshot">[],
  markers: NormalizedEvent<"repo_markers"> | undefined,
): RepoFacts {
  const latest = snapshots.at(-1);
  return {
    repo,
    qualifyingCommits: 0,
    latestLanguages: latest?.metadata.languages ?? null,
    latestTopics: latest?.metadata.topics ?? [],
    markerPaths: markers?.metadata.paths ?? null,
    markersObservedOn: markers?.metadata.observedOn ?? null,
  };
}

/** Integer share of `part` in milli-points: floor(exp × part × 1000 / total). */
export function milliShare(exp: number, part: number, total: number): number {
  return total > 0 ? Math.floor((exp * part * 1000) / total) : 0;
}
