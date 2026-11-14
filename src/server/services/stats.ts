import { and, eq, inArray } from "drizzle-orm";
import { distanceKm } from "@/lib/geo";
import type { Db } from "@/server/db/client";
import { entries, entryPeople, media, users } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { tagsOfEntries, type Tag } from "./tags";
import { listTrips, type Trip } from "./trips";

export type Counts = {
  entries: number;
  /** Distinct days with at least one entry. */
  days: number;
  photos: number;
  videos: number;
  /** Straight-line length of the routes (point A to point B), in kilometres. */
  routeKm: number;
};

export type TripStats = { trip: Pick<Trip, "id" | "slug" | "title" | "startDate" | "endDate" | "isVisible"> } & Counts;
export type Ranked<T> = T & { count: number };

export type JournalStats = {
  trips: TripStats[];
  totals: Counts & { trips: number };
  /** Most used tags, most used first. */
  tags: Ranked<Tag>[];
  /** Who wrote the published entries. */
  authors: Ranked<{ id: number; displayName: string }>[];
  /** Who is identified in the published entries. */
  people: Ranked<{ id: number; displayName: string }>[];
};

const TOP = 10;

function rank<T extends { id: number }>(counts: Map<number, Ranked<T>>, name: (item: T) => string): Ranked<T>[] {
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || name(a).localeCompare(name(b), "fr", { sensitivity: "base" }))
    .slice(0, TOP);
}

function bump<T extends { id: number }>(counts: Map<number, Ranked<T>>, item: T): void {
  const current = counts.get(item.id);
  if (current) current.count += 1;
  else counts.set(item.id, { ...item, count: 1 });
}

/**
 * Figures of the journal, computed only from what the actor may see on the
 * trip pages, and only from published entries (drafts are work in progress).
 */
export function journalStats(db: Db, actor: Actor): JournalStats {
  const tagCounts = new Map<number, Ranked<Tag>>();
  const authorCounts = new Map<number, Ranked<{ id: number; displayName: string }>>();
  const peopleCounts = new Map<number, Ranked<{ id: number; displayName: string }>>();

  const trips = listTrips(db, actor).map((trip): TripStats => {
    const published = db
      .select({ entry: entries, author: { id: users.id, displayName: users.displayName } })
      .from(entries)
      .innerJoin(users, eq(users.id, entries.authorId))
      .where(and(eq(entries.tripId, trip.id), eq(entries.status, "published")))
      .all();
    const ids = published.map(({ entry }) => entry.id);
    const { id, slug, title, startDate, endDate, isVisible } = trip;
    const counts: TripStats = {
      trip: { id, slug, title, startDate, endDate, isVisible },
      entries: ids.length,
      days: new Set(published.map(({ entry }) => entry.date)).size,
      photos: 0,
      videos: 0,
      routeKm: 0,
    };
    if (ids.length === 0) return counts;

    for (const { entry, author } of published) {
      bump(authorCounts, author);
      if (entry.pointALat !== null && entry.pointALng !== null && entry.pointBLat !== null && entry.pointBLng !== null) {
        counts.routeKm += distanceKm({ lat: entry.pointALat, lng: entry.pointALng }, { lat: entry.pointBLat, lng: entry.pointBLng });
      }
    }
    for (const row of db.select({ kind: media.kind }).from(media).where(inArray(media.entryId, ids)).all()) {
      if (row.kind === "photo") counts.photos += 1;
      else counts.videos += 1;
    }
    for (const tags of tagsOfEntries(db, ids).values()) for (const tag of tags) bump(tagCounts, tag);
    for (const person of db
      .select({ id: users.id, displayName: users.displayName })
      .from(entryPeople)
      .innerJoin(users, eq(users.id, entryPeople.userId))
      .where(inArray(entryPeople.entryId, ids))
      .all()) {
      bump(peopleCounts, person);
    }
    return counts;
  });

  const sum = (key: keyof Counts) => trips.reduce((total, trip) => total + trip[key], 0);
  return {
    trips,
    totals: {
      trips: trips.length,
      entries: sum("entries"),
      days: sum("days"),
      photos: sum("photos"),
      videos: sum("videos"),
      routeKm: sum("routeKm"),
    },
    tags: rank(tagCounts, (tag) => tag.name),
    authors: rank(authorCounts, (user) => user.displayName),
    people: rank(peopleCounts, (user) => user.displayName),
  };
}
