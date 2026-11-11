import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { comments, entries, reactions, trips, users } from "@/server/db/schema";
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
  it("applies account defaults: comment and react on, publish off", () => {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user).toMatchObject({
      role: "user",
      canPublish: false,
      canComment: true,
      canReact: true,
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

  it("allows a single reaction per user and per entry", () => {
    db.insert(reactions).values({ userId, entryId, type: "like" }).run();
    expect(() => db.insert(reactions).values({ userId, entryId, type: "love" }).run()).toThrow(/UNIQUE/);
  });

  it("allows a single reaction per user and per comment", () => {
    const commentId = db.insert(comments).values({ entryId, authorId: userId, body: "Nice" }).returning().get().id;
    db.insert(reactions).values({ userId, commentId, type: "haha" }).run();
    expect(() => db.insert(reactions).values({ userId, commentId, type: "wow" }).run()).toThrow(/UNIQUE/);
    // Reacting to the entry itself is a separate target.
    db.insert(reactions).values({ userId, entryId, type: "like" }).run();
    expect(db.select().from(reactions).all()).toHaveLength(2);
  });

  it("requires a reaction to target exactly one element", () => {
    expect(() => db.insert(reactions).values({ userId, type: "like" }).run()).toThrow(/CHECK/);
    const commentId = db.insert(comments).values({ entryId, authorId: userId, body: "Nice" }).returning().get().id;
    expect(() => db.insert(reactions).values({ userId, entryId, commentId, type: "like" }).run()).toThrow(/CHECK/);
  });

  it("enforces foreign keys", () => {
    expect(() => db.insert(comments).values({ entryId: 9999, authorId: userId, body: "x" }).run()).toThrow(
      /FOREIGN KEY/,
    );
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

  it("removes comments, replies and reactions with their entry", () => {
    const parentId = db.insert(comments).values({ entryId, authorId: userId, body: "Parent" }).returning().get().id;
    const replyId = db
      .insert(comments)
      .values({ entryId, parentId, authorId: userId, body: "Reply" })
      .returning()
      .get().id;
    db.insert(reactions).values({ userId, commentId: replyId, type: "love" }).run();
    db.insert(reactions).values({ userId, entryId, type: "like" }).run();

    db.delete(entries).where(eq(entries.id, entryId)).run();

    expect(db.select().from(comments).all()).toHaveLength(0);
    expect(db.select().from(reactions).all()).toHaveLength(0);
  });

  it("refuses to delete a user who authored entries", () => {
    expect(() => db.delete(users).where(eq(users.id, userId)).run()).toThrow(/FOREIGN KEY/);
  });
});
