/**
 * Marker injection (PRD §6.16, INT-6): the generator replaces exactly the content between
 * one `<!-- LEGENDS:START -->` and one `<!-- LEGENDS:END -->` line. Anything unusual (no
 * markers, duplicates, wrong order, markers not on their own line) is an error, and the
 * README is left untouched.
 */
export const START = "<!-- LEGENDS:START -->";
export const END = "<!-- LEGENDS:END -->";

export class MarkerError extends Error {}

function positions(readme: string, marker: string): number[] {
  const out: number[] = [];
  let i = readme.indexOf(marker);
  while (i >= 0) {
    out.push(i);
    i = readme.indexOf(marker, i + 1);
  }
  return out;
}

export interface MarkerSpan {
  /** Index of the first character after the START line. */
  start: number;
  /** Index of the END marker. */
  end: number;
}

export function findMarkers(readme: string): MarkerSpan {
  const starts = positions(readme, START);
  const ends = positions(readme, END);
  if (starts.length !== 1 || ends.length !== 1)
    throw new MarkerError(
      `expected exactly one ${START} and one ${END}; found ${starts.length} and ${ends.length}`,
    );
  const s = starts[0] as number;
  const e = ends[0] as number;
  if (e < s) throw new MarkerError(`${END} comes before ${START}`);
  const ownLine = (i: number, len: number) =>
    (i === 0 || readme[i - 1] === "\n") &&
    (readme[i + len] === "\n" ||
      i + len === readme.length ||
      readme.slice(i + len, i + len + 2) === "\r\n");
  if (!ownLine(s, START.length) || !ownLine(e, END.length))
    throw new MarkerError("markers must be on their own lines");
  return { start: s + START.length + 1, end: e };
}

/** The current content between the markers. */
export function extractBlock(readme: string): string {
  const { start, end } = findMarkers(readme);
  return readme.slice(start, end);
}

/** Replaces the block; everything outside the markers is kept byte for byte. */
export function injectBlock(readme: string, block: string): string {
  const { start, end } = findMarkers(readme);
  if (block.includes(START) || block.includes(END))
    throw new MarkerError("the block must not contain the markers");
  const body = block.endsWith("\n") ? block : `${block}\n`;
  return readme.slice(0, start) + body + readme.slice(end);
}

/** Outside-the-markers content, for byte-identity checks. */
export function outsideMarkers(readme: string): string {
  const { start, end } = findMarkers(readme);
  return readme.slice(0, start) + readme.slice(end);
}
