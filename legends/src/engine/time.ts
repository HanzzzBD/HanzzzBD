/**
 * Calendar maths in the player's timezone. Pure functions; no wall clock.
 * Days are "YYYY-MM-DD" strings in the player's timezone; instants are UTC ISO-8601.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;

/** Strict ISO-8601 instant with an explicit offset. Returns epoch ms or null. */
export function parseInstant(value: unknown): number | null {
  if (typeof value !== "string" || !INSTANT.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isDay(value: string): boolean {
  return DAY.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function localParts(ms: number, timeZone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out;
}

/** Player day of an instant. */
export function dayOf(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Local minute of day (0–1439) of an instant. */
export function minuteOfDay(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  return (p.hour ?? 0) * 60 + (p.minute ?? 0);
}

/** Instant (ms) of 00:00 local time on `day`. */
export function dayStart(day: string, timeZone: string): number {
  const guess = Date.parse(`${day}T00:00:00Z`);
  let result = guess;
  for (let i = 0; i < 3; i++) {
    const p = localParts(result, timeZone);
    const asUtc = Date.UTC(
      p.year ?? 0,
      (p.month ?? 1) - 1,
      p.day ?? 1,
      p.hour ?? 0,
      p.minute ?? 0,
      p.second ?? 0,
    );
    const offset = asUtc - result;
    const next = guess - offset;
    if (next === result) break;
    result = next;
  }
  return result;
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * MS_DAY).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DAY);
}

/** ISO-8601 week id, e.g. "2026-W53". */
export function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(date.getTime() + (3 - weekday) * MS_DAY);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  const week1Monday = firstThursday.getTime() - firstWeekday * MS_DAY;
  const week = Math.floor((thursday.getTime() - week1Monday) / (7 * MS_DAY)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- seasons (calendar quarters)

export interface SeasonInfo {
  /** 1-based season number; S1 starts on `season1Start`. */
  number: number;
  id: string;
  startDay: string;
  /** Last day of the season (inclusive). */
  endDay: string;
}

function quarterIndex(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return year * 4 + Math.floor((month - 1) / 3);
}

export function assertSeason1Start(day: string): void {
  if (!isDay(day) || !/-(01|04|07|10)-01$/.test(day)) {
    throw new Error(
      "season1Start must be the first day of a calendar quarter (YYYY-01|04|07|10-01)",
    );
  }
}

export function seasonByNumber(number: number, season1Start: string): SeasonInfo {
  const q = quarterIndex(season1Start) + number - 1;
  const year = Math.floor(q / 4);
  const startMonth = (q % 4) * 3 + 1;
  const startDay = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const nextQ = q + 1;
  const nextStart = `${Math.floor(nextQ / 4)}-${String((nextQ % 4) * 3 + 1).padStart(2, "0")}-01`;
  return { number, id: `S${number}`, startDay, endDay: addDays(nextStart, -1) };
}

/** Season containing `day`, or null when the day is before Season 1. */
export function seasonOf(day: string, season1Start: string): SeasonInfo | null {
  const n = quarterIndex(day) - quarterIndex(season1Start) + 1;
  return n >= 1 ? seasonByNumber(n, season1Start) : null;
}
