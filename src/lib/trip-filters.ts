import { isValidDateString } from "./dates";

// Filters of a trip's journal and map, kept in the page address
// (?jour=2026-11-14&tags=plage,randonnee) so that the back button works and a
// filtered view can be shared.

export type TripFilters = {
  /** Calendar day (YYYY-MM-DD), or null for every day. */
  date: string | null;
  /** Tag slugs: an entry matches when it has at least one of them. */
  tagSlugs: string[];
};

type SearchParams = Record<string, string | string[] | undefined>;

const MAX_TAGS = 20;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reads filters from the query string, ignoring anything malformed. */
export function parseTripFilters(params: SearchParams): TripFilters {
  const day = typeof params.jour === "string" && isValidDateString(params.jour) ? params.jour : null;
  // Accepts both "tags=a,b" (links) and "tags=a&tags=b" (the filter form).
  const raw = [params.tags ?? []].flat().flatMap((value) => value.split(","));
  const tagSlugs = [...new Set(raw.map((slug) => slug.trim()).filter((slug) => SLUG_PATTERN.test(slug)))].slice(0, MAX_TAGS);
  return { date: day, tagSlugs };
}

export function hasActiveFilters(filters: TripFilters): boolean {
  return filters.date !== null || filters.tagSlugs.length > 0;
}

/** Query string for these filters, starting with "?" (empty when there is none). */
export function filtersToQuery(filters: TripFilters): string {
  const params = new URLSearchParams();
  if (filters.date) params.set("jour", filters.date);
  if (filters.tagSlugs.length > 0) params.set("tags", filters.tagSlugs.join(","));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Whether an entry with this day and these tags is kept by the filters. */
export function matchesFilters(filters: TripFilters, entry: { date: string; tagSlugs: string[] }): boolean {
  if (filters.date && entry.date !== filters.date) return false;
  if (filters.tagSlugs.length > 0 && !entry.tagSlugs.some((slug) => filters.tagSlugs.includes(slug))) return false;
  return true;
}
