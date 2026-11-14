// Who has read which entry: an entry counts as read once its page has been
// opened. Only published entries are tracked, and an author never has their
// own entries to read.
//
// - Each reader sees a "new" mark on the entries they have not opened yet.
// - The people who run the journal see, for each entry, who read it and who did not.

import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { entries, entryReads, users } from "@/server/db/schema";
import { canBeNotifiedAboutTrip, canManageJournal, canViewEntry, type Actor, type PermissionUser } from "@/server/permissions";
import type { Entry } from "./entries";
import type { Trip } from "./trips";

/** Records that the actor opened this entry. True only the first time. */
export function markEntryRead(db: Db, actor: Actor, trip: Trip, entry: Entry, now = new Date()): boolean {
  if (!actor || entry.tripId !== trip.id || entry.status !== "published" || !canViewEntry(actor, trip, entry)) return false;
  if (entry.authorId === actor.id) return false;
  const result = db.insert(entryReads).values({ entryId: entry.id, userId: actor.id, readAt: now }).onConflictDoNothing().run();
  return result.changes > 0;
}

/** Among these entries, the published ones the actor has not opened yet (never their own). */
export function unreadEntryIds(db: Db, actor: Actor, list: Pick<Entry, "id" | "status" | "authorId">[]): Set<number> {
  if (!actor) return new Set();
  const candidates = list.filter((entry) => entry.status === "published" && entry.authorId !== actor.id).map((entry) => entry.id);
  if (candidates.length === 0) return new Set();
  const read = new Set(
    db
      .select({ id: entryReads.entryId })
      .from(entryReads)
      .where(and(eq(entryReads.userId, actor.id), inArray(entryReads.entryId, candidates)))
      .all()
      .map((row) => row.id),
  );
  return new Set(candidates.filter((id) => !read.has(id)));
}

/** Number of published entries not opened yet, per trip (only trips the actor can see are given). */
export function unreadCountByTrip(db: Db, actor: Actor, tripList: Trip[]): Map<number, number> {
  const counts = new Map<number, number>();
  if (!actor || tripList.length === 0) return counts;
  const published = db
    .select({ id: entries.id, tripId: entries.tripId, status: entries.status, authorId: entries.authorId })
    .from(entries)
    .where(and(inArray(entries.tripId, tripList.map((trip) => trip.id)), eq(entries.status, "published")))
    .all();
  const unread = unreadEntryIds(db, actor, published);
  for (const entry of published) {
    if (unread.has(entry.id)) counts.set(entry.tripId, (counts.get(entry.tripId) ?? 0) + 1);
  }
  return counts;
}

export type EntryReaders = {
  author: string;
  /** Oldest reading first. */
  read: { id: number; displayName: string; readAt: Date }[];
  /** Alphabetical. */
  unread: { id: number; displayName: string }[];
};

/**
 * Who read a published entry and who has not yet, among the active accounts
 * that can see it (its author aside). Only for the people who run the journal.
 */
export function listEntryReaders(db: Db, actor: Actor, trip: Trip, entry: Entry): EntryReaders | null {
  if (!canManageJournal(actor) || entry.tripId !== trip.id || entry.status !== "published" || !canViewEntry(actor, trip, entry)) {
    return null;
  }
  const accounts = db.select().from(users).all();
  const author = accounts.find((user) => user.id === entry.authorId)?.displayName ?? "";
  const readAt = new Map(
    db
      .select()
      .from(entryReads)
      .where(eq(entryReads.entryId, entry.id))
      .all()
      .map((row) => [row.userId, row.readAt]),
  );
  // The audience: everyone who can see the entry now (as for notifications).
  const audience = accounts.filter(
    (user) => user.id !== entry.authorId && canBeNotifiedAboutTrip(user as PermissionUser, trip),
  );
  const byName = (a: { displayName: string }, b: { displayName: string }) =>
    a.displayName.localeCompare(b.displayName, "fr", { sensitivity: "base" });
  return {
    author,
    read: audience
      .filter((user) => readAt.has(user.id))
      .map((user) => ({ id: user.id, displayName: user.displayName, readAt: readAt.get(user.id)! }))
      .sort((a, b) => a.readAt.getTime() - b.readAt.getTime()),
    unread: audience
      .filter((user) => !readAt.has(user.id))
      .map((user) => ({ id: user.id, displayName: user.displayName }))
      .sort(byName),
  };
}
