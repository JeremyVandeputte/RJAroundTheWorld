import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { EntryInput } from "@/server/services/entries";
import type { TripInput } from "@/server/services/trips";

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
