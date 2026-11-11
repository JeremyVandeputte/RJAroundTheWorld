import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { comments, entries, entryPeople, users } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  listTaggableUsers,
  updateEntry,
  type Entry,
} from "@/server/services/entries";
import { createTrip, updateTrip, type Trip } from "@/server/services/trips";
import { entryInput, insertCast, insertUser, tripInput } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
/** Has both Publier and Gérer les voyages: creates the hidden trip and writes in it. */
let tripOwner: SessionUser;
let visibleTrip: Trip;
let hiddenTrip: Trip;

function mustCreateTrip(overrides = {}, actor: Actor = cast.superuser): Trip {
  const result = createTrip(db, actor, tripInput(overrides));
  if (!result.ok) throw new Error(result.reason);
  return result.trip;
}

function mustCreateEntry(actor: Actor, trip: Trip, intent: "save" | "publish", overrides = {}): Entry {
  const result = createEntry(db, actor, trip.id, entryInput(overrides), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}

const titles = (actor: Actor, trip: Trip) => listEntries(db, actor, trip).map((entry) => entry.title);
const stored = (id: number) => db.select().from(entries).where(eq(entries.id, id)).get();

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  tripOwner = insertUser(db, "chloe", { canPublish: true, canManageTrips: true });
  visibleTrip = mustCreateTrip({ title: "Visible" });
  hiddenTrip = mustCreateTrip({ title: "Caché", isVisible: false }, tripOwner);
});

describe("drafts and publication", () => {
  it("saves a new entry as a draft, seen only by its author and the superuser", () => {
    const draft = mustCreateEntry(cast.publisher, visibleTrip, "save", { title: "Brouillon" });
    expect(draft).toMatchObject({ status: "draft", publishedAt: null, authorId: cast.publisher.id });

    expect(titles(cast.publisher, visibleTrip)).toEqual(["Brouillon"]);
    expect(titles(cast.superuser, visibleTrip)).toEqual(["Brouillon"]);
    for (const actor of [null, cast.guest, cast.otherPublisher]) {
      expect(titles(actor, visibleTrip)).toEqual([]);
      expect(getEntry(db, actor, visibleTrip, draft.id)).toBeNull();
    }
  });

  it("makes an entry visible to everyone once published", () => {
    const draft = mustCreateEntry(cast.publisher, visibleTrip, "save");
    const published = updateEntry(db, cast.publisher, draft.id, entryInput(), "publish");
    expect(published.ok && published.entry.status).toBe("published");
    expect(published.ok && published.entry.publishedAt).toBeInstanceOf(Date);

    for (const actor of [null, cast.guest, cast.otherPublisher, cast.superuser]) {
      expect(getEntry(db, actor, visibleTrip, draft.id)?.entry.id).toBe(draft.id);
    }
  });

  it("can publish directly at creation", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish");
    expect(entry.status).toBe("published");
    expect(titles(null, visibleTrip)).toEqual([entry.title]);
  });

  it("keeps a published entry published when it is edited", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish");
    const edited = updateEntry(db, cast.publisher, entry.id, entryInput({ title: "Titre corrigé" }), "save");
    expect(edited.ok && edited.entry).toMatchObject({ status: "published", title: "Titre corrigé" });
  });

  it("hides an entry again when it is unpublished", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish");
    const firstPublication = entry.publishedAt;
    const withdrawn = updateEntry(db, cast.publisher, entry.id, entryInput(), "unpublish");
    expect(withdrawn.ok && withdrawn.entry.status).toBe("draft");
    // The date of first publication is kept.
    expect(withdrawn.ok && withdrawn.entry.publishedAt).toEqual(firstPublication);

    expect(getEntry(db, null, visibleTrip, entry.id)).toBeNull();
    expect(getEntry(db, cast.guest, visibleTrip, entry.id)).toBeNull();
    expect(getEntry(db, cast.publisher, visibleTrip, entry.id)).not.toBeNull();
  });

  it("requires a place to publish, but not to save a draft", () => {
    const noPlace = entryInput({ pointA: null });
    expect(createEntry(db, cast.publisher, visibleTrip.id, noPlace, "publish")).toEqual({
      ok: false,
      reason: "location_required",
    });
    const draft = createEntry(db, cast.publisher, visibleTrip.id, noPlace, "save");
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(updateEntry(db, cast.publisher, draft.entry.id, noPlace, "publish")).toEqual({
      ok: false,
      reason: "location_required",
    });
    expect(updateEntry(db, cast.publisher, draft.entry.id, entryInput(), "publish").ok).toBe(true);
    // A published entry cannot lose its place either.
    expect(updateEntry(db, cast.publisher, draft.entry.id, noPlace, "save")).toEqual({
      ok: false,
      reason: "location_required",
    });
    expect(updateEntry(db, cast.publisher, draft.entry.id, noPlace, "unpublish").ok).toBe(true);
  });
});

describe("hidden trips", () => {
  let publishedInHidden: Entry;

  beforeEach(() => {
    publishedInHidden = mustCreateEntry(tripOwner, hiddenTrip, "publish", { title: "Surprise" });
  });

  it("hide all their entries, even published, from everyone but their creator and the superuser", () => {
    for (const actor of [null, cast.guest, cast.publisher, cast.otherPublisher, cast.manager]) {
      expect(titles(actor, hiddenTrip)).toEqual([]);
      expect(getEntry(db, actor, hiddenTrip, publishedInHidden.id)).toBeNull();
    }
  });

  it("show their published entries to the creator of the trip and the superuser", () => {
    for (const actor of [cast.superuser, tripOwner]) {
      expect(titles(actor, hiddenTrip)).toEqual(["Surprise"]);
      expect(getEntry(db, actor, hiddenTrip, publishedInHidden.id)).not.toBeNull();
    }
  });

  it("reveal every published entry at once when the trip becomes visible, but not drafts", () => {
    mustCreateEntry(tripOwner, hiddenTrip, "publish", { title: "Deuxième", date: "2026-11-12" });
    mustCreateEntry(tripOwner, hiddenTrip, "save", { title: "Brouillon", date: "2026-11-13" });

    const revealed = updateTrip(db, cast.superuser, hiddenTrip.id, tripInput({ title: "Caché", isVisible: true }));
    if (!revealed.ok) throw new Error(revealed.reason);

    expect(titles(null, revealed.trip)).toEqual(["Deuxième", "Surprise"]);
    expect(titles(cast.guest, revealed.trip)).toEqual(["Deuxième", "Surprise"]);
  });

  it("hide a publisher's own entries when the trip they wrote in is hidden afterwards", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish", { title: "Écrite avant" });
    const hidden = updateTrip(db, cast.superuser, visibleTrip.id, tripInput({ title: "Visible", isVisible: false }));
    if (!hidden.ok) throw new Error(hidden.reason);

    expect(getEntry(db, cast.publisher, hidden.trip, entry.id)).toBeNull();
    expect(titles(cast.publisher, hidden.trip)).toEqual([]);
    expect(updateEntry(db, cast.publisher, entry.id, entryInput(), "save")).toEqual({ ok: false, reason: "not_found" });
    expect(deleteEntry(db, cast.publisher, entry.id)).toEqual({ ok: false, reason: "not_found" });
    expect(getEntry(db, cast.superuser, hidden.trip, entry.id)).not.toBeNull();

    const shown = updateTrip(db, cast.superuser, visibleTrip.id, tripInput({ title: "Visible", isVisible: true }));
    expect(shown.ok && getEntry(db, cast.publisher, shown.trip, entry.id)).not.toBeNull();
  });

  it("refuse writes from people who cannot see them, without revealing they exist", () => {
    for (const actor of [null, cast.guest, cast.publisher]) {
      expect(createEntry(db, actor, hiddenTrip.id, entryInput(), "save")).toEqual({ ok: false, reason: "not_found" });
      expect(updateEntry(db, actor, publishedInHidden.id, entryInput(), "save")).toEqual({ ok: false, reason: "not_found" });
      expect(deleteEntry(db, actor, publishedInHidden.id)).toEqual({ ok: false, reason: "not_found" });
    }
    expect(createEntry(db, cast.guest, 9999, entryInput(), "save")).toEqual({ ok: false, reason: "not_found" });
  });

  it("do not let an entry be reached through another trip's address", () => {
    expect(getEntry(db, cast.superuser, visibleTrip, publishedInHidden.id)).toBeNull();
    expect(getEntry(db, null, visibleTrip, publishedInHidden.id)).toBeNull();
  });
});

describe("who can write", () => {
  it("requires Publier to create an entry", () => {
    for (const actor of [null, cast.guest]) {
      expect(createEntry(db, actor, visibleTrip.id, entryInput(), "save")).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(db.select().from(entries).all()).toHaveLength(0);
    expect(createEntry(db, cast.publisher, visibleTrip.id, entryInput(), "save").ok).toBe(true);
    expect(createEntry(db, cast.superuser, hiddenTrip.id, entryInput(), "publish").ok).toBe(true);
  });

  it("never lets a user edit, unpublish or delete someone else's entry", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish");
    for (const actor of [null, cast.guest, cast.otherPublisher]) {
      expect(updateEntry(db, actor, entry.id, entryInput({ title: "Piraté" }), "save")).toEqual({
        ok: false,
        reason: "forbidden",
      });
      expect(updateEntry(db, actor, entry.id, entryInput(), "unpublish").ok).toBe(false);
      expect(deleteEntry(db, actor, entry.id)).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(stored(entry.id)).toMatchObject({ title: "Première baignade", status: "published" });
  });

  it("does not reveal another user's draft through a refused edit", () => {
    const draft = mustCreateEntry(cast.publisher, visibleTrip, "save");
    expect(updateEntry(db, cast.otherPublisher, draft.id, entryInput(), "publish")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("lets the superuser edit and delete any entry, keeping the original author", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "save");
    const edited = updateEntry(db, cast.superuser, entry.id, entryInput({ title: "Corrigé" }), "publish");
    expect(edited.ok && edited.entry).toMatchObject({ title: "Corrigé", status: "published", authorId: cast.publisher.id });
    expect(deleteEntry(db, cast.superuser, entry.id).ok).toBe(true);
    expect(stored(entry.id)).toBeUndefined();
  });

  it("stops an author from editing once Publier is removed", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish");
    const demoted = { ...cast.publisher, canPublish: false };
    expect(updateEntry(db, demoted, entry.id, entryInput({ title: "Encore" }), "save")).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("deletes an entry with its comments", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish");
    db.insert(comments).values({ entryId: entry.id, authorId: cast.guest.id, body: "Super" }).run();
    expect(deleteEntry(db, cast.publisher, entry.id).ok).toBe(true);
    expect(db.select().from(comments).all()).toHaveLength(0);
  });
});

describe("entry content", () => {
  it("stores a one-way route with two points and optional names", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish", {
      pointA: { lat: 14.8, lng: -61.16, name: " Départ " },
      pointB: { lat: 14.81, lng: -61.17, name: "" },
    });
    expect(entry).toMatchObject({
      pointALat: 14.8,
      pointALng: -61.16,
      pointAName: "Départ",
      pointBLat: 14.81,
      pointBLng: -61.17,
      pointBName: null,
    });
  });

  it("rejects invalid input", () => {
    const attempt = (overrides: object) => createEntry(db, cast.publisher, visibleTrip.id, entryInput(overrides), "save");
    expect(attempt({ date: "2026-02-30" })).toEqual({ ok: false, reason: "invalid_date" });
    expect(attempt({ title: " " })).toEqual({ ok: false, reason: "invalid_title" });
    expect(attempt({ title: "x".repeat(151) })).toEqual({ ok: false, reason: "invalid_title" });
    expect(attempt({ body: "x".repeat(20_001) })).toEqual({ ok: false, reason: "body_too_long" });
    expect(attempt({ pointA: { lat: 91, lng: 0, name: "" } })).toEqual({ ok: false, reason: "invalid_point" });
    expect(attempt({ pointA: { lat: 0, lng: -181, name: "" } })).toEqual({ ok: false, reason: "invalid_point" });
    expect(attempt({ pointA: { lat: Number.NaN, lng: 0, name: "" } })).toEqual({ ok: false, reason: "invalid_point" });
    expect(attempt({ pointA: { lat: 0, lng: 0, name: "x".repeat(101) } })).toEqual({ ok: false, reason: "invalid_point" });
    expect(attempt({ pointA: null, pointB: { lat: 1, lng: 1, name: "" } })).toEqual({
      ok: false,
      reason: "point_b_requires_a",
    });
    expect(attempt({ peopleIds: [9999] })).toEqual({ ok: false, reason: "invalid_people" });
    expect(attempt({ peopleIds: [Number.NaN] })).toEqual({ ok: false, reason: "invalid_people" });
    expect(db.select().from(entries).all()).toHaveLength(0);
  });

  it("stores the text as typed, without interpreting it", () => {
    const body = '<script>alert(1)</script>\r\nLigne 2 **gras**';
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "save", { body });
    expect(entry.body).toBe("<script>alert(1)</script>\nLigne 2 **gras**");
  });
});

describe("identified people", () => {
  it("are saved, shown in alphabetical order and replaced on update", () => {
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish", {
      peopleIds: [cast.guest.id, cast.superuser.id, cast.guest.id],
    });
    const names = () => getEntry(db, null, visibleTrip, entry.id)?.people.map((person) => person.displayName);
    expect(names()).toEqual(["admin", "marie"]);

    updateEntry(db, cast.publisher, entry.id, entryInput({ peopleIds: [cast.otherPublisher.id] }), "save");
    expect(names()).toEqual(["paul"]);

    updateEntry(db, cast.publisher, entry.id, entryInput({ peopleIds: [] }), "save");
    expect(db.select().from(entryPeople).all()).toHaveLength(0);
  });

  it("can only be picked by people allowed to write", () => {
    insertUser(db, "ancien", { isActive: false });
    expect(listTaggableUsers(db, null)).toEqual([]);
    expect(listTaggableUsers(db, cast.guest)).toEqual([]);
    const names = listTaggableUsers(db, cast.publisher).map((person) => person.displayName);
    expect(names).toEqual(["admin", "chloe", "lucie", "marie", "paul", "romane"]);
    // Only the id and the display name are exposed.
    expect(Object.keys(listTaggableUsers(db, cast.superuser)[0] ?? {})).toEqual(["id", "displayName"]);
  });

  it("shows the author's display name with the entry", () => {
    db.update(users).set({ displayName: "Romane" }).where(eq(users.id, cast.publisher.id)).run();
    const entry = mustCreateEntry(cast.publisher, visibleTrip, "publish");
    expect(getEntry(db, null, visibleTrip, entry.id)?.author).toEqual({ id: cast.publisher.id, displayName: "Romane" });
    expect(listEntries(db, null, visibleTrip)[0]?.authorName).toBe("Romane");
  });
});

describe("listing entries", () => {
  it("orders entries by day, most recent first", () => {
    mustCreateEntry(cast.publisher, visibleTrip, "publish", { title: "Jour 1", date: "2026-11-01" });
    mustCreateEntry(cast.publisher, visibleTrip, "publish", { title: "Jour 3", date: "2026-11-03" });
    mustCreateEntry(cast.publisher, visibleTrip, "publish", { title: "Jour 2", date: "2026-11-02" });
    expect(titles(null, visibleTrip)).toEqual(["Jour 3", "Jour 2", "Jour 1"]);
  });

  it("mixes each viewer's own drafts with published entries", () => {
    mustCreateEntry(cast.publisher, visibleTrip, "publish", { title: "Publiée", date: "2026-11-01" });
    mustCreateEntry(cast.publisher, visibleTrip, "save", { title: "Brouillon de Romane", date: "2026-11-02" });
    mustCreateEntry(cast.otherPublisher, visibleTrip, "save", { title: "Brouillon de Paul", date: "2026-11-03" });

    expect(titles(null, visibleTrip)).toEqual(["Publiée"]);
    expect(titles(cast.publisher, visibleTrip)).toEqual(["Brouillon de Romane", "Publiée"]);
    expect(titles(cast.otherPublisher, visibleTrip)).toEqual(["Brouillon de Paul", "Publiée"]);
    expect(titles(cast.superuser, visibleTrip)).toEqual(["Brouillon de Paul", "Brouillon de Romane", "Publiée"]);
  });
});
