import { beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { deleteEntry, createEntry, type Entry } from "@/server/services/entries";
import { listEntryReaders, markEntryRead, unreadCountByTrip, unreadEntryIds } from "@/server/services/reads";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, insertUser, makeTrip } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let editor: SessionUser; // Publier + Gérer les voyages
let trip: Trip;

function entry(intent: "save" | "publish", overrides = {}, author: Actor = cast.publisher, inTrip = trip): Entry {
  const result = createEntry(db, author, inTrip.id, entryInput({ peopleIds: [cast.guest.id], ...overrides }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  editor = insertUser(db, "chloe", { canPublish: true, canManageTrips: true });
  trip = makeTrip(db, cast.superuser, { title: "Martinique" });
});

describe("unread entries", () => {
  it("are the published entries not opened yet, never one's own", () => {
    const first = entry("publish", { title: "Plage" });
    const second = entry("publish", { title: "Volcan" });
    const draft = entry("save", { title: "Brouillon" });
    const all = [first, second, draft];

    expect(unreadEntryIds(db, cast.guest, all)).toEqual(new Set([first.id, second.id]));
    expect(unreadEntryIds(db, cast.publisher, all)).toEqual(new Set()); // the author
    expect(unreadEntryIds(db, null, all)).toEqual(new Set());

    expect(markEntryRead(db, cast.guest, trip, first)).toBe(true);
    expect(markEntryRead(db, cast.guest, trip, first)).toBe(false); // already read
    expect(unreadEntryIds(db, cast.guest, all)).toEqual(new Set([second.id]));
    // Someone else's reading changes nothing for Marie... and the reverse.
    expect(unreadEntryIds(db, cast.otherPublisher, all)).toEqual(new Set([first.id, second.id]));
  });

  it("are counted per trip for the home page", () => {
    const other = makeTrip(db, cast.superuser, { title: "Islande" });
    const first = entry("publish");
    entry("publish");
    entry("publish", {}, cast.publisher, other);
    markEntryRead(db, cast.guest, trip, first);
    expect(unreadCountByTrip(db, cast.guest, [trip, other])).toEqual(new Map([[trip.id, 1], [other.id, 1]]));
  });

  it("are not recorded for drafts, one's own entries, or entries one cannot see", () => {
    const draft = entry("save");
    const own = entry("publish");
    const hidden = makeTrip(db, cast.superuser, { title: "Surprise", isVisible: false });
    const secret = entry("publish", {}, cast.superuser, hidden);
    expect(markEntryRead(db, cast.superuser, trip, draft)).toBe(false);
    expect(markEntryRead(db, cast.publisher, trip, own)).toBe(false);
    expect(markEntryRead(db, cast.guest, hidden, secret)).toBe(false);
    expect(markEntryRead(db, null, trip, own)).toBe(false);
    expect(markEntryRead(db, cast.guest, hidden, own)).toBe(false); // entry from another trip
  });
});

describe("who read an entry", () => {
  it("lists readers (oldest first) and those who have not read it, author aside", () => {
    const published = entry("publish");
    markEntryRead(db, cast.otherPublisher, trip, published, new Date("2026-11-12T10:00:00Z"));
    markEntryRead(db, cast.guest, trip, published, new Date("2026-11-11T09:00:00Z"));
    insertUser(db, "ancien", { isActive: false });

    const readers = listEntryReaders(db, editor, trip, published)!;
    expect(readers.author).toBe(cast.publisher.displayName);
    expect(readers.read.map((reader) => reader.id)).toEqual([cast.guest.id, cast.otherPublisher.id]);
    expect(readers.read[0]!.readAt).toEqual(new Date("2026-11-11T09:00:00Z"));
    const unreadNames = readers.unread.map((reader) => reader.displayName);
    expect(unreadNames).toEqual([...unreadNames].sort((a, b) => a.localeCompare(b, "fr")));
    expect(readers.unread.map((reader) => reader.id).sort()).toEqual([cast.superuser.id, cast.manager.id, editor.id].sort());
  });

  it("only counts the people who can see a hidden trip", () => {
    const hidden = makeTrip(db, cast.superuser, { title: "Surprise", isVisible: false });
    const secret = entry("publish", {}, cast.superuser, hidden);
    const readers = listEntryReaders(db, cast.superuser, hidden, secret)!;
    expect(readers.read).toEqual([]);
    expect(readers.unread).toEqual([]); // only the superuser sees it, and wrote it
  });

  it("is only for the people who run the journal, and only for published entries", () => {
    const published = entry("publish");
    const draft = entry("save");
    for (const actor of [cast.guest, cast.publisher, cast.manager, null]) {
      expect(listEntryReaders(db, actor, trip, published)).toBeNull();
    }
    expect(listEntryReaders(db, cast.superuser, trip, published)).not.toBeNull();
    expect(listEntryReaders(db, cast.superuser, trip, draft)).toBeNull();
  });

  it("forgets the readings of a deleted entry", () => {
    const published = entry("publish");
    markEntryRead(db, cast.guest, trip, published);
    expect(deleteEntry(db, cast.publisher, published.id).ok).toBe(true);
    const again = entry("publish");
    expect(unreadEntryIds(db, cast.guest, [again])).toEqual(new Set([again.id]));
  });
});
