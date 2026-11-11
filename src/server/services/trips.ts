import { count, desc, eq } from "drizzle-orm";
import { isValidDateString } from "@/lib/dates";
import { slugify } from "@/lib/slug";
import type { Db } from "@/server/db/client";
import { entries, trips, users } from "@/server/db/schema";
import { canCreateTrip, canEditTrip, canViewTrip, type Actor } from "@/server/permissions";

export type Trip = typeof trips.$inferSelect;

export const TRIP_TITLE_MAX_LENGTH = 100;
export const TRIP_DESCRIPTION_MAX_LENGTH = 500;

export type TripInput = {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  isVisible: boolean;
};

export type TripIssue = "invalid_title" | "invalid_description" | "invalid_dates" | "end_before_start";

/** Slugs that would collide with fixed routes under /trips/. */
const RESERVED_SLUGS = new Set(["new"]);

/** Trips the actor is allowed to see, most recent first. Hidden trips never leak. */
export function listTrips(db: Db, actor: Actor): Trip[] {
  return db
    .select()
    .from(trips)
    .orderBy(desc(trips.startDate), desc(trips.id))
    .all()
    .filter((trip) => canViewTrip(actor, trip));
}

/** A trip the actor cannot see is reported exactly like a trip that does not exist. */
export function getTripBySlug(db: Db, actor: Actor, slug: string): Trip | null {
  const trip = db.select().from(trips).where(eq(trips.slug, slug)).get();
  return trip && canViewTrip(actor, trip) ? trip : null;
}

export function getTripById(db: Db, actor: Actor, tripId: number): Trip | null {
  const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
  return trip && canViewTrip(actor, trip) ? trip : null;
}

/** Display name of the user who created the trip, if that account still exists. */
export function getTripAuthorName(db: Db, trip: Trip): string | null {
  if (trip.authorId === null) return null;
  return db.select({ name: users.displayName }).from(users).where(eq(users.id, trip.authorId)).get()?.name ?? null;
}

/** Number of entries of a trip, drafts included (shown before deleting it). */
export function countTripEntries(db: Db, tripId: number): number {
  return db.select({ total: count() }).from(entries).where(eq(entries.tripId, tripId)).get()?.total ?? 0;
}

function validate(input: TripInput): TripIssue | null {
  const title = input.title.trim();
  if (title.length === 0 || title.length > TRIP_TITLE_MAX_LENGTH) return "invalid_title";
  if (input.description.trim().length > TRIP_DESCRIPTION_MAX_LENGTH) return "invalid_description";
  if (!isValidDateString(input.startDate) || !isValidDateString(input.endDate)) return "invalid_dates";
  if (input.endDate < input.startDate) return "end_before_start";
  return null;
}

function uniqueSlug(db: Db, title: string): string {
  const base = slugify(title) || "voyage";
  for (let suffix = 1; ; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const taken = db.select({ id: trips.id }).from(trips).where(eq(trips.slug, candidate)).get();
    if (!taken && !RESERVED_SLUGS.has(candidate)) return candidate;
  }
}

type TripRefusal = "forbidden" | "trip_not_found";

export type SaveTripResult = { ok: true; trip: Trip } | { ok: false; reason: TripRefusal | TripIssue };

/** The creator of a trip is recorded: only they and the superuser can change it later. */
export function createTrip(db: Db, actor: Actor, input: TripInput): SaveTripResult {
  if (!actor || !canCreateTrip(actor)) return { ok: false, reason: "forbidden" };
  const issue = validate(input);
  if (issue) return { ok: false, reason: issue };

  const trip = db
    .insert(trips)
    .values({
      authorId: actor.id,
      slug: uniqueSlug(db, input.title),
      title: input.title.trim(),
      description: input.description.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      isVisible: input.isVisible,
    })
    .returning()
    .get();
  return { ok: true, trip };
}

/** Loads a trip for a change; a trip the actor cannot see is reported as unknown. */
function findEditable(db: Db, actor: Actor, tripId: number): { ok: true; trip: Trip } | { ok: false; reason: TripRefusal } {
  const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
  if (!trip || !canViewTrip(actor, trip)) return { ok: false, reason: "trip_not_found" };
  if (!canEditTrip(actor, trip)) return { ok: false, reason: "forbidden" };
  return { ok: true, trip };
}

/**
 * Edits a trip, including its visibility. The slug and the author never
 * change, so links stay valid and the trip keeps its owner.
 */
export function updateTrip(db: Db, actor: Actor, tripId: number, input: TripInput): SaveTripResult {
  const found = findEditable(db, actor, tripId);
  if (!found.ok) return found;
  const issue = validate(input);
  if (issue) return { ok: false, reason: issue };

  const trip = db
    .update(trips)
    .set({
      title: input.title.trim(),
      description: input.description.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      isVisible: input.isVisible,
    })
    .where(eq(trips.id, tripId))
    .returning()
    .get();
  return trip ? { ok: true, trip } : { ok: false, reason: "trip_not_found" };
}

/** Deletes a trip together with all its entries, their comments and reactions. */
export function deleteTrip(db: Db, actor: Actor, tripId: number): { ok: true } | { ok: false; reason: TripRefusal } {
  const found = findEditable(db, actor, tripId);
  if (!found.ok) return found;

  db.transaction((tx) => {
    // Comments, reactions, notifications and tags go with their entry.
    tx.delete(entries).where(eq(entries.tripId, tripId)).run();
    tx.delete(trips).where(eq(trips.id, tripId)).run();
  });
  return { ok: true };
}
