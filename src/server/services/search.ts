import { eq, inArray } from "drizzle-orm";
import { plainText } from "@/lib/rich-text";
import { excerpt, highlight, matchesAllTerms, searchTerms, type Segment } from "@/lib/search";
import type { Db } from "@/server/db/client";
import { entries, entryPeople, users, type EntryStatus } from "@/server/db/schema";
import { canViewEntry, type Actor } from "@/server/permissions";
import { tagsOfEntries } from "./tags";
import { listTrips } from "./trips";

export const MAX_SEARCH_RESULTS = 50;

export type SearchResult = {
  entryId: number;
  tripSlug: string;
  tripTitle: string;
  date: string;
  /** Order within the day (see entries.dayPosition). */
  dayPosition: number;
  status: EntryStatus;
  /** Title with the searched words highlighted. */
  title: Segment[];
  /** Passage of the text around the first match. */
  excerpt: Segment[];
};

export type SearchOutcome = {
  /** Words actually searched (lower case, without accents). */
  terms: string[];
  /** Number of matching entries, possibly more than the results shown. */
  total: number;
  /** Most recent first, at most MAX_SEARCH_RESULTS. */
  results: SearchResult[];
};

/**
 * Entries the actor may see (the same ones as on the trip pages: published
 * entries, plus their own drafts) containing every word of the query, in
 * the title, text, place names, tags, trip, author or identified people.
 */
export function searchEntries(db: Db, actor: Actor, query: string): SearchOutcome {
  const terms = searchTerms(query);
  if (terms.length === 0) return { terms, total: 0, results: [] };

  const found: SearchResult[] = [];
  for (const trip of listTrips(db, actor)) {
    const rows = db
      .select({ entry: entries, authorName: users.displayName })
      .from(entries)
      .innerJoin(users, eq(users.id, entries.authorId))
      .where(eq(entries.tripId, trip.id))
      .all()
      .filter(({ entry }) => canViewEntry(actor, trip, entry));
    if (rows.length === 0) continue;

    const ids = rows.map(({ entry }) => entry.id);
    const tagsByEntry = tagsOfEntries(db, ids);
    const peopleByEntry = new Map<number, string[]>();
    for (const person of db
      .select({ entryId: entryPeople.entryId, name: users.displayName })
      .from(entryPeople)
      .innerJoin(users, eq(users.id, entryPeople.userId))
      .where(inArray(entryPeople.entryId, ids))
      .all()) {
      peopleByEntry.set(person.entryId, [...(peopleByEntry.get(person.entryId) ?? []), person.name]);
    }

    for (const { entry, authorName } of rows) {
      const body = plainText(entry.body);
      const searchable = [
        entry.title,
        body,
        entry.pointAName ?? "",
        entry.pointBName ?? "",
        ...(tagsByEntry.get(entry.id) ?? []).map((tag) => tag.name),
        trip.title,
        authorName,
        ...(peopleByEntry.get(entry.id) ?? []),
      ].join("\n");
      if (!matchesAllTerms(searchable, terms)) continue;
      found.push({
        entryId: entry.id,
        tripSlug: trip.slug,
        tripTitle: trip.title,
        date: entry.date,
        dayPosition: entry.dayPosition,
        status: entry.status,
        title: highlight(entry.title, terms),
        excerpt: body ? excerpt(body, terms) : [],
      });
    }
  }

  // Same order as the journals: most recent day first, then the day's order.
  found.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.dayPosition - a.dayPosition || b.entryId - a.entryId));
  return {
    terms,
    total: found.length,
    results: found.slice(0, MAX_SEARCH_RESULTS),
  };
}
