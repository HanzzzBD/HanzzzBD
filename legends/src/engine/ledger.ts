/**
 * Ledger (L2): append-only award records. Every entry's `id` is its idempotency key,
 * so the same rule can never reward the same subject twice (STK-1).
 */
export type LedgerKind = "exp" | "bp" | "star" | "trial" | "season" | "flag" | "unlock";
export type LedgerReason = "capped" | "weekly_cap" | "overflow" | "season_closed";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  rule: string;
  ruleVersion: string;
  /** Event keys with revision (`key@rev`), period ids, or season ids. */
  subject: string[];
  amount: number;
  reason?: LedgerReason;
  /** Player day used for daily caps (event date). */
  eventDay?: string;
  /** Player day used for battles, quests and weekly caps (effective date, PRD §4.4). */
  effectiveDay?: string;
  week?: string;
  season?: string;
  meta?: Record<string, string | number | boolean>;
  createdAt: string;
}

export class LedgerIndex {
  readonly #byId = new Map<string, LedgerEntry>();
  readonly entries: LedgerEntry[] = [];

  constructor(existing: readonly LedgerEntry[]) {
    for (const entry of existing) this.#insert(entry);
  }

  has(id: string): boolean {
    return this.#byId.has(id);
  }

  get(id: string): LedgerEntry | undefined {
    return this.#byId.get(id);
  }

  /** Appends a new entry. Returns false (and appends nothing) when the id already exists. */
  add(entry: LedgerEntry): boolean {
    if (this.#byId.has(entry.id)) return false;
    this.#insert(entry);
    return true;
  }

  filter(predicate: (e: LedgerEntry) => boolean): LedgerEntry[] {
    return this.entries.filter(predicate);
  }

  #insert(entry: LedgerEntry): void {
    if (this.#byId.has(entry.id)) throw new Error(`Duplicate ledger id in input: ${entry.id}`);
    this.#byId.set(entry.id, entry);
    this.entries.push(entry);
  }
}
