import { count, desc, eq } from "drizzle-orm";
import { isValidDateString } from "@/lib/dates";
import { slugify } from "@/lib/slug";
import type { Db } from "@/server/db/client";
import { entries, trips, users } from "@/server/db/schema";
import { canCreateTrip, canEditTrip, canViewTrip, type Actor } from "@/server/permissions";
import { notifyTripRevealed } from "./notifications";

export type Trip = typeof trips.$inferSelect;

export const TRIP_TITLE_MAX_LENGTH = 100;

export type TripInput = {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  isVisible: boolean;
};

export type TripIssue = "invalid_title" | "invalid_dates" | "end_before_start" | "cover_required";

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
  // The description has no length limit: the trip page shows it in full.
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
  // A trip needs a thumbnail to be visible: it is always created hidden first.
  if (input.isVisible) return { ok: false, reason: "cover_required" };

  const trip = db.transaction((tx) => {
    const created = tx
      .insert(trips)
      .values({
        authorId: actor.id,
        slug: uniqueSlug(tx as unknown as Db, input.title),
        title: input.title.trim(),
        description: input.description.trim(),
        startDate: input.startDate,
        endDate: input.endDate,
        isVisible: input.isVisible,
      })
      .returning()
      .get();
    // A trip created visible is announced like a trip revealed.
    notifyTripRevealed(tx as unknown as Db, actor.id, created);
    return created;
  });
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
  // Making a trip visible requires a thumbnail (a visible trip keeps its state).
  if (!found.trip.isVisible && input.isVisible && found.trip.coverMediaId === null) {
    return { ok: false, reason: "cover_required" };
  }

  const trip = db.transaction((tx) => {
    const updated = tx
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
    const isRevealed = !found.trip.isVisible && updated?.isVisible;
    if (updated && actor && isRevealed) notifyTripRevealed(tx as unknown as Db, actor.id, updated);
    return updated;
  });
  return trip ? { ok: true, trip } : { ok: false, reason: "trip_not_found" };
}

/**
 * Deletes a trip together with all its entries.
 * Returns the ids of the deleted entries: their media files must be removed from disk.
 */
export function deleteTrip(
  db: Db,
  actor: Actor,
  tripId: number,
): { ok: true; entryIds: number[] } | { ok: false; reason: TripRefusal } {
  const found = findEditable(db, actor, tripId);
  if (!found.ok) return found;

  const entryIds = db.transaction((tx) => {
    // Media rows, notifications and tags go with their entry.
    const deleted = tx.delete(entries).where(eq(entries.tripId, tripId)).returning({ id: entries.id }).all();
    tx.delete(trips).where(eq(trips.id, tripId)).run();
    return deleted.map((entry) => entry.id);
  });
  return { ok: true, entryIds };
}
