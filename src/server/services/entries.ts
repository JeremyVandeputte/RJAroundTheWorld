import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { isValidDateString } from "@/lib/dates";
import type { Db } from "@/server/db/client";
import { entries, entryPeople, trips, users, type EntryStatus } from "@/server/db/schema";
import { canCreateEntry, canEditEntry, canViewEntry, canViewTrip, canWriteEntries, type Actor } from "@/server/permissions";
import type { Trip } from "./trips";

export type Entry = typeof entries.$inferSelect;
export type Person = { id: number; displayName: string };

export const ENTRY_TITLE_MAX_LENGTH = 150;
export const ENTRY_BODY_MAX_LENGTH = 20_000;
export const POINT_NAME_MAX_LENGTH = 100;

export type PointInput = { lat: number; lng: number; name: string };

export type EntryInput = {
  date: string;
  title: string;
  body: string;
  /** Users identified in the entry. */
  peopleIds: number[];
  /** Fixed place, or start of a one-way route. */
  pointA: PointInput | null;
  /** End of a one-way route. */
  pointB: PointInput | null;
};

/**
 * - save: keep the current status (a new entry starts as a draft)
 * - publish: make the entry visible (if its trip is)
 * - unpublish: turn a published entry back into a draft
 */
export type EntryIntent = "save" | "publish" | "unpublish";

export type EntryIssue =
  | "invalid_date"
  | "invalid_title"
  | "body_too_long"
  | "invalid_point"
  | "point_b_requires_a"
  | "location_required"
  | "invalid_people";

export type EntryListItem = Pick<Entry, "id" | "date" | "title" | "status" | "authorId"> & { authorName: string };
export type EntryDetail = { entry: Entry; author: Person; people: Person[] };

/** Entries of a trip the actor may see, most recent day first. */
export function listEntries(db: Db, actor: Actor, trip: Trip): EntryListItem[] {
  if (!canViewTrip(actor, trip)) return [];
  return db
    .select({
      id: entries.id,
      date: entries.date,
      title: entries.title,
      status: entries.status,
      authorId: entries.authorId,
      authorName: users.displayName,
    })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.authorId))
    .where(eq(entries.tripId, trip.id))
    .orderBy(desc(entries.date), desc(entries.id))
    .all()
    .filter((entry) => canViewEntry(actor, trip, entry));
}

/** An entry the actor cannot see is reported exactly like one that does not exist. */
export function getEntry(db: Db, actor: Actor, trip: Trip, entryId: number): EntryDetail | null {
  const row = db
    .select({ entry: entries, authorName: users.displayName })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.authorId))
    .where(and(eq(entries.id, entryId), eq(entries.tripId, trip.id)))
    .get();
  if (!row || !canViewEntry(actor, trip, row.entry)) return null;

  const people = db
    .select({ id: users.id, displayName: users.displayName })
    .from(entryPeople)
    .innerJoin(users, eq(users.id, entryPeople.userId))
    .where(eq(entryPeople.entryId, entryId))
    .orderBy(asc(sql`lower(${users.displayName})`))
    .all();
  return { entry: row.entry, author: { id: row.entry.authorId, displayName: row.authorName }, people };
}

/** Accounts that can be identified in an entry, for people allowed to write one. */
export function listTaggableUsers(db: Db, actor: Actor): Person[] {
  if (!canWriteEntries(actor)) return [];
  return db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(sql`lower(${users.displayName})`))
    .all();
}

function isValidPoint(point: PointInput): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180 &&
    point.name.trim().length <= POINT_NAME_MAX_LENGTH
  );
}

function validate(db: Db, input: EntryInput, resultingStatus: EntryStatus): EntryIssue | null {
  if (!isValidDateString(input.date)) return "invalid_date";
  const title = input.title.trim();
  if (title.length === 0 || title.length > ENTRY_TITLE_MAX_LENGTH) return "invalid_title";
  if (input.body.length > ENTRY_BODY_MAX_LENGTH) return "body_too_long";

  if ((input.pointA && !isValidPoint(input.pointA)) || (input.pointB && !isValidPoint(input.pointB))) {
    return "invalid_point";
  }
  if (input.pointB && !input.pointA) return "point_b_requires_a";
  // A draft can be saved without a place; a published entry needs one.
  if (resultingStatus === "published" && !input.pointA) return "location_required";

  const peopleIds = [...new Set(input.peopleIds)];
  if (peopleIds.length > 0) {
    const known = db.select({ id: users.id }).from(users).where(inArray(users.id, peopleIds)).all();
    if (known.length !== peopleIds.length) return "invalid_people";
  }
  return null;
}

function entryValues(input: EntryInput) {
  return {
    date: input.date,
    title: input.title.trim(),
    body: input.body.replace(/\r\n?/g, "\n").trim(),
    pointALat: input.pointA?.lat ?? null,
    pointALng: input.pointA?.lng ?? null,
    pointAName: input.pointA?.name.trim() || null,
    pointBLat: input.pointB?.lat ?? null,
    pointBLng: input.pointB?.lng ?? null,
    pointBName: input.pointB?.name.trim() || null,
  };
}

function replacePeople(db: Db, entryId: number, peopleIds: number[]): void {
  db.delete(entryPeople).where(eq(entryPeople.entryId, entryId)).run();
  const unique = [...new Set(peopleIds)];
  if (unique.length > 0) {
    db.insert(entryPeople).values(unique.map((userId) => ({ entryId, userId }))).run();
  }
}

export type SaveEntryResult =
  | { ok: true; entry: Entry; trip: Trip }
  | { ok: false; reason: "forbidden" | "not_found" | EntryIssue };

export function createEntry(
  db: Db,
  actor: Actor,
  tripId: number,
  input: EntryInput,
  intent: Exclude<EntryIntent, "unpublish">,
  now = new Date(),
): SaveEntryResult {
  const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
  if (!trip || !canViewTrip(actor, trip)) return { ok: false, reason: "not_found" };
  if (!actor || !canCreateEntry(actor, trip)) return { ok: false, reason: "forbidden" };

  const status: EntryStatus = intent === "publish" ? "published" : "draft";
  const issue = validate(db, input, status);
  if (issue) return { ok: false, reason: issue };

  const entry = db.transaction((tx) => {
    const created = tx
      .insert(entries)
      .values({
        ...entryValues(input),
        tripId: trip.id,
        authorId: actor.id,
        status,
        publishedAt: status === "published" ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    replacePeople(tx as unknown as Db, created.id, input.peopleIds);
    return created;
  });
  return { ok: true, entry, trip };
}

/** Loads an entry with its trip for a change; hides what the actor cannot see. */
function findEditable(db: Db, actor: Actor, entryId: number): { ok: true; entry: Entry; trip: Trip } | { ok: false; reason: "forbidden" | "not_found" } {
  const row = db
    .select({ entry: entries, trip: trips })
    .from(entries)
    .innerJoin(trips, eq(trips.id, entries.tripId))
    .where(eq(entries.id, entryId))
    .get();
  if (!row || !canViewEntry(actor, row.trip, row.entry)) return { ok: false, reason: "not_found" };
  if (!canEditEntry(actor, row.trip, row.entry)) return { ok: false, reason: "forbidden" };
  return { ok: true, entry: row.entry, trip: row.trip };
}

export function updateEntry(
  db: Db,
  actor: Actor,
  entryId: number,
  input: EntryInput,
  intent: EntryIntent,
  now = new Date(),
): SaveEntryResult {
  const found = findEditable(db, actor, entryId);
  if (!found.ok) return found;

  const status: EntryStatus =
    intent === "publish" ? "published" : intent === "unpublish" ? "draft" : found.entry.status;
  const issue = validate(db, input, status);
  if (issue) return { ok: false, reason: issue };

  const entry = db.transaction((tx) => {
    const updated = tx
      .update(entries)
      .set({
        ...entryValues(input),
        status,
        // Date of the first publication: kept when an entry is unpublished.
        publishedAt: found.entry.publishedAt ?? (status === "published" ? now : null),
        updatedAt: now,
      })
      .where(eq(entries.id, entryId))
      .returning()
      .get();
    replacePeople(tx as unknown as Db, entryId, input.peopleIds);
    return updated;
  });
  return entry ? { ok: true, entry, trip: found.trip } : { ok: false, reason: "not_found" };
}

/** Deletes an entry with its comments, reactions and notifications. */
export function deleteEntry(db: Db, actor: Actor, entryId: number): { ok: true; trip: Trip } | { ok: false; reason: "forbidden" | "not_found" } {
  const found = findEditable(db, actor, entryId);
  if (!found.ok) return found;
  db.delete(entries).where(eq(entries.id, entryId)).run();
  return { ok: true, trip: found.trip };
}
