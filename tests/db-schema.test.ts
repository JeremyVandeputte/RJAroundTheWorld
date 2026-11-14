import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { entries, entryPeople, trips, users } from "@/server/db/schema";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let userId: number;
let entryId: number;

beforeEach(() => {
  db = createTestDb();
  userId = db
    .insert(users)
    .values({ username: "alice", displayName: "Alice", passwordHash: "x" })
    .returning()
    .get().id;
  const tripId = db
    .insert(trips)
    .values({ slug: "martinique", title: "Martinique", startDate: "2026-11-01", endDate: "2027-01-31" })
    .returning()
    .get().id;
  entryId = db
    .insert(entries)
    .values({ tripId, authorId: userId, date: "2026-11-11", title: "First day" })
    .returning()
    .get().id;
});

describe("database schema", () => {
  it("applies account defaults: read only", () => {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user).toMatchObject({
      role: "user",
      canPublish: false,
      canManageTrips: false,
      mustChangePassword: false,
      isActive: true,
    });
  });

  it("creates trips hidden and entries as drafts by default", () => {
    expect(db.select().from(trips).get()?.isVisible).toBe(false);
    expect(db.select().from(entries).get()?.status).toBe("draft");
  });

  it("rejects duplicate usernames", () => {
    expect(() =>
      db.insert(users).values({ username: "alice", displayName: "Other", passwordHash: "x" }).run(),
    ).toThrow(/UNIQUE/);
  });

  it("enforces foreign keys", () => {
    expect(() => db.insert(entryPeople).values({ entryId: 9999, userId }).run()).toThrow(/FOREIGN KEY/);
  });

  it("rejects incomplete or inconsistent location points", () => {
    const update = (values: Partial<typeof entries.$inferInsert>) =>
      db.update(entries).set(values).where(eq(entries.id, entryId)).run();

    expect(() => update({ pointALat: 14.6 })).toThrow(/CHECK/);
    expect(() => update({ pointBLat: 14.6, pointBLng: -61 })).toThrow(/CHECK/);
    update({ pointALat: 14.6, pointALng: -61.0, pointAName: "Fort-de-France" });
    update({ pointBLat: 14.8, pointBLng: -61.1 });
    expect(db.select().from(entries).get()).toMatchObject({ pointALat: 14.6, pointBLng: -61.1 });
  });

  it("refuses to delete a user who authored entries", () => {
    expect(() => db.delete(users).where(eq(users.id, userId)).run()).toThrow(/FOREIGN KEY/);
  });
});
