import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { eq } from "drizzle-orm";
import { media, trips, users } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import type { EntryInput } from "@/server/services/entries";
import { createTrip, updateTrip, type Trip, type TripInput } from "@/server/services/trips";

type UserOverrides = Partial<Omit<typeof users.$inferInsert, "username" | "passwordHash">>;

/** Inserts an account directly (no password hashing: fast, for permission tests). */
export function insertUser(db: Db, username: string, overrides: UserOverrides = {}): SessionUser {
  const { passwordHash: _passwordHash, ...user } = db
    .insert(users)
    .values({ username, displayName: username, passwordHash: "not-a-real-hash", ...overrides })
    .returning()
    .get();
  return user;
}

/** The usual cast: a superuser, two publishers, a guest and a trip manager. */
export function insertCast(db: Db) {
  return {
    superuser: insertUser(db, "admin", { role: "superuser", canPublish: true }),
    publisher: insertUser(db, "romane", { canPublish: true }),
    otherPublisher: insertUser(db, "paul", { canPublish: true }),
    guest: insertUser(db, "marie"),
    manager: insertUser(db, "lucie", { canManageTrips: true }),
  };
}

export function tripInput(overrides: Partial<TripInput> = {}): TripInput {
  return {
    title: "Martinique",
    description: "Trois mois sous les tropiques",
    startDate: "2026-11-01",
    endDate: "2027-01-31",
    isVisible: true,
    ...overrides,
  };
}

export function entryInput(overrides: Partial<EntryInput> = {}): EntryInput {
  return {
    date: "2026-11-11",
    title: "Première baignade",
    body: "Une **belle** journée.",
    peopleIds: [],
    pointA: { lat: 14.6037, lng: -61.0742, name: "Fort-de-France" },
    pointB: null,
    ...overrides,
  };
}

let coverCounter = 0;

/** Gives a trip its own thumbnail photo (database row only, no file). */
export function attachCover(db: Db, tripId: number, uploaderId: number): void {
  coverCounter += 1;
  const row = db
    .insert(media)
    .values({
      publicId: `cover-${tripId}-${coverCounter}`.padEnd(22, "x").slice(0, 22),
      tripId,
      uploaderId,
      kind: "photo",
      filePath: `trip-${tripId}/cover.jpg`,
      thumbPath: `trip-${tripId}/cover_thumb.jpg`,
      mimeType: "image/jpeg",
      // Weighs nothing in the quota, so storage tests are not affected.
      sizeBytes: 0,
    })
    .returning()
    .get();
  db.update(trips).set({ coverMediaId: row.id }).where(eq(trips.id, tripId)).run();
}

/**
 * Creates a trip the way a user does: hidden first, then given a thumbnail
 * (so it can be made visible, now or later in the test), then made visible
 * when a visible trip is asked for.
 */
export function makeTrip(db: Db, actor: Actor, overrides: Partial<TripInput> = {}): Trip {
  const input = tripInput(overrides);
  const created = createTrip(db, actor, { ...input, isVisible: false });
  if (!created.ok) throw new Error(created.reason);
  attachCover(db, created.trip.id, actor!.id);
  if (!input.isVisible) return db.select().from(trips).where(eq(trips.id, created.trip.id)).get()!;
  const shown = updateTrip(db, actor, created.trip.id, input);
  if (!shown.ok) throw new Error(shown.reason);
  return shown.trip;
}
