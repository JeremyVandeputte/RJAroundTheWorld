// Search in the journal: case and accents are ignored ("foret" finds
// "Forêt"), and every word of the query must be found.

export const MAX_QUERY_LENGTH = 100;
const MAX_TERMS = 10;

/** Text segment of an excerpt; `match` segments are highlighted. */
export type Segment = { text: string; match: boolean };

const LIGATURES: Record<string, string> = { œ: "oe", æ: "ae", ß: "ss", "’": "'" };

function foldChar(char: string): string {
  const lower = char.toLowerCase();
  return LIGATURES[lower] ?? lower.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Folded text, plus for each of its characters the position of the original
 * character it comes from: positions found in the folded text can then be
 * mapped back to the original, to highlight it.
 */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  let folded = "";
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const piece = foldChar(char);
    folded += piece;
    for (let i = 0; i < piece.length; i++) origin.push(index);
    index += char.length;
  }
  origin.push(index);
  return { folded, origin };
}

/** Lower case, without accents. */
export function foldForSearch(text: string): string {
  return foldWithMap(text).folded;
}

/** Words of a query, folded, without duplicates. */
export function searchTerms(query: string): string[] {
  const words = foldForSearch(query.slice(0, MAX_QUERY_LENGTH))
    .split(/[^\p{L}\p{N}'-]+/u)
    .map((word) => word.replace(/^['-]+|['-]+$/g, ""))
    .filter((word) => word.length > 0);
  return [...new Set(words)].slice(0, MAX_TERMS);
}

/** Whether every term is found in the text. */
export function matchesAllTerms(text: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const folded = foldForSearch(text);
  return terms.every((term) => folded.includes(term));
}

/** Ranges [start, end[ of the original text matching a term, merged and sorted. */
function matchRanges(text: string, terms: string[]): [number, number][] {
  const { folded, origin } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      ranges.push([origin[at]!, origin[at + term.length]!]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** The whole text, with the terms highlighted. */
export function highlight(text: string, terms: string[]): Segment[] {
  return toSegments(text, matchRanges(text, terms), 0, text.length);
}

/**
 * A short passage around the first match, with the terms highlighted;
 * the beginning of the text when no term is found in it.
 */
export function excerpt(text: string, terms: string[], length = 180): Segment[] {
  const ranges = matchRanges(text, terms);
  const first = ranges[0];
  let start = first ? Math.max(0, first[0] - Math.floor(length / 3)) : 0;
  let end = Math.min(text.length, start + length);
  // Cut at word boundaries.
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < (first?.[0] ?? end)) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > (first?.[1] ?? start)) end = space;
  }
  const segments = toSegments(text, ranges, start, end);
  if (start > 0) segments.unshift({ text: "…", match: false });
  if (end < text.length) segments.push({ text: "…", match: false });
  return segments;
}

function toSegments(text: string, ranges: [number, number][], start: number, end: number): Segment[] {
  const segments: Segment[] = [];
  let cursor = start;
  for (const [from, to] of ranges) {
    if (to <= start || from >= end) continue;
    const a = Math.max(from, start);
    const b = Math.min(to, end);
    if (a > cursor) segments.push({ text: text.slice(cursor, a), match: false });
    segments.push({ text: text.slice(a, b), match: true });
    cursor = b;
  }
  if (cursor < end) segments.push({ text: text.slice(cursor, end), match: false });
  return segments;
}
