import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { comments, entries, reactions, trips, users } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import {
  countTripEntries,
  createTrip,
  deleteTrip,
  getTripAuthorName,
  getTripById,
  getTripBySlug,
  listTrips,
  updateTrip,
  type Trip,
} from "@/server/services/trips";
import { insertCast, insertUser, tripInput } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let otherManager: SessionUser;

function mustCreate(actor: Actor, overrides = {}): Trip {
  const result = createTrip(db, actor, tripInput(overrides));
  if (!result.ok) throw new Error(result.reason);
  return result.trip;
}

const titles = (actor: Actor) => listTrips(db, actor).map((trip) => trip.title);
const exists = (trip: Trip) => db.select().from(trips).where(eq(trips.id, trip.id)).get() !== undefined;

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  otherManager = insertUser(db, "chloe", { canManageTrips: true, canPublish: true });
});

describe("creating trips", () => {
  it("requires the Gérer les voyages permission", () => {
    for (const actor of [null, cast.guest, cast.publisher]) {
      expect(createTrip(db, actor, tripInput())).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(db.select().from(trips).all()).toHaveLength(0);
    expect(createTrip(db, cast.manager, tripInput()).ok).toBe(true);
    expect(createTrip(db, cast.superuser, tripInput()).ok).toBe(true);
  });

  it("records who created the trip", () => {
    const trip = mustCreate(cast.manager);
    expect(trip.authorId).toBe(cast.manager.id);
    expect(getTripAuthorName(db, trip)).toBe("lucie");
  });

  it("stops working as soon as the permission is removed or the account restricted", () => {
    const former = { ...cast.manager, canManageTrips: false };
    const locked = { ...cast.manager, mustChangePassword: true };
    const deactivated = { ...cast.manager, isActive: false };
    for (const actor of [former, locked, deactivated]) {
      expect(createTrip(db, actor, tripInput())).toEqual({ ok: false, reason: "forbidden" });
    }
  });

  it("builds a unique slug from the title and never changes it", () => {
    const first = mustCreate(cast.superuser, { title: "Séjour en Martinique" });
    const second = mustCreate(cast.superuser, { title: "Séjour en Martinique" });
    const reserved = mustCreate(cast.superuser, { title: "New" });
    const symbols = mustCreate(cast.superuser, { title: "???" });
    expect([first.slug, second.slug, reserved.slug, symbols.slug]).toEqual([
      "sejour-en-martinique",
      "sejour-en-martinique-2",
      "new-2",
      "voyage",
    ]);

    const renamed = updateTrip(db, cast.superuser, first.id, tripInput({ title: "Autre titre" }));
    expect(renamed.ok && renamed.trip).toMatchObject({ title: "Autre titre", slug: "sejour-en-martinique" });
  });

  it("validates the input", () => {
    const attempt = (overrides: object) => createTrip(db, cast.superuser, tripInput(overrides));
    expect(attempt({ title: "  " })).toEqual({ ok: false, reason: "invalid_title" });
    expect(attempt({ title: "x".repeat(101) })).toEqual({ ok: false, reason: "invalid_title" });
    expect(attempt({ description: "x".repeat(501) })).toEqual({ ok: false, reason: "invalid_description" });
    expect(attempt({ startDate: "2026-02-30" })).toEqual({ ok: false, reason: "invalid_dates" });
    expect(attempt({ startDate: "2026-11-02", endDate: "2026-11-01" })).toEqual({ ok: false, reason: "end_before_start" });
    expect(attempt({ startDate: "2026-11-01", endDate: "2026-11-01" }).ok).toBe(true);
  });
});

describe("editing trips", () => {
  it("is reserved to the creator of the trip and the superuser", () => {
    const trip = mustCreate(cast.manager, { title: "Voyage de Lucie" });
    for (const actor of [null, cast.guest, cast.publisher, otherManager]) {
      expect(updateTrip(db, actor, trip.id, tripInput({ title: "Piraté", isVisible: false }))).toEqual({
        ok: false,
        reason: "forbidden",
      });
    }
    expect(getTripById(db, null, trip.id)).toMatchObject({ title: "Voyage de Lucie", isVisible: true });

    expect(updateTrip(db, cast.manager, trip.id, tripInput({ title: "Renommé par Lucie" })).ok).toBe(true);
    const bySuperuser = updateTrip(db, cast.superuser, trip.id, tripInput({ title: "Renommé par l'admin" }));
    // The trip keeps its creator when the superuser edits it.
    expect(bySuperuser.ok && bySuperuser.trip).toMatchObject({ title: "Renommé par l'admin", authorId: cast.manager.id });
  });

  it("does not let a trip manager touch a trip created by the superuser", () => {
    const trip = mustCreate(cast.superuser);
    expect(updateTrip(db, cast.manager, trip.id, tripInput({ isVisible: false }))).toEqual({ ok: false, reason: "forbidden" });
    expect(deleteTrip(db, cast.manager, trip.id)).toEqual({ ok: false, reason: "forbidden" });
    expect(getTripById(db, null, trip.id)?.isVisible).toBe(true);
  });

  it("stops the creator from editing once Gérer les voyages is removed", () => {
    const trip = mustCreate(cast.manager);
    const former = { ...cast.manager, canManageTrips: false };
    expect(updateTrip(db, former, trip.id, tripInput({ title: "Encore" }))).toEqual({ ok: false, reason: "forbidden" });
    expect(deleteTrip(db, former, trip.id)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("reports an unknown trip, and a hidden one the same way", () => {
    const hidden = mustCreate(cast.manager, { isVisible: false });
    expect(updateTrip(db, cast.superuser, 9999, tripInput())).toEqual({ ok: false, reason: "trip_not_found" });
    for (const actor of [null, cast.guest, cast.publisher, otherManager]) {
      expect(updateTrip(db, actor, hidden.id, tripInput())).toEqual({ ok: false, reason: "trip_not_found" });
      expect(deleteTrip(db, actor, hidden.id)).toEqual({ ok: false, reason: "trip_not_found" });
    }
    expect(exists(hidden)).toBe(true);
  });
});

describe("trip visibility", () => {
  let visible: Trip;
  let hiddenBySuperuser: Trip;
  let hiddenByManager: Trip;

  beforeEach(() => {
    visible = mustCreate(cast.superuser, { title: "Visible", startDate: "2026-11-01" });
    hiddenBySuperuser = mustCreate(cast.superuser, {
      title: "Caché (admin)",
      startDate: "2027-06-01",
      endDate: "2027-06-15",
      isVisible: false,
    });
    hiddenByManager = mustCreate(cast.manager, {
      title: "Caché (Lucie)",
      startDate: "2027-08-01",
      endDate: "2027-08-15",
      isVisible: false,
    });
  });

  it("lists a hidden trip only for its creator and the superuser", () => {
    expect(titles(null)).toEqual(["Visible"]);
    expect(titles(cast.guest)).toEqual(["Visible"]);
    expect(titles(cast.publisher)).toEqual(["Visible"]);
    expect(titles(otherManager)).toEqual(["Visible"]);
    expect(titles(cast.manager)).toEqual(["Caché (Lucie)", "Visible"]);
    expect(titles(cast.superuser)).toEqual(["Caché (Lucie)", "Caché (admin)", "Visible"]);
  });

  it("answers exactly like an unknown trip when a hidden trip is requested directly", () => {
    for (const actor of [null, cast.guest, cast.publisher, otherManager]) {
      for (const hidden of [hiddenBySuperuser, hiddenByManager]) {
        expect(getTripBySlug(db, actor, hidden.slug)).toBeNull();
        expect(getTripById(db, actor, hidden.id)).toBeNull();
      }
      expect(getTripBySlug(db, actor, "does-not-exist")).toBeNull();
    }
    expect(getTripBySlug(db, cast.manager, hiddenBySuperuser.slug)).toBeNull();
    expect(getTripBySlug(db, cast.manager, hiddenByManager.slug)?.id).toBe(hiddenByManager.id);
    expect(getTripBySlug(db, cast.superuser, hiddenByManager.slug)?.id).toBe(hiddenByManager.id);
    expect(getTripBySlug(db, null, visible.slug)?.id).toBe(visible.id);
  });

  it("hides a creator's own hidden trip while their account is restricted", () => {
    const locked = { ...cast.manager, mustChangePassword: true };
    const deactivated = { ...cast.manager, isActive: false };
    for (const actor of [locked, deactivated]) {
      expect(titles(actor)).toEqual(["Visible"]);
      expect(getTripBySlug(db, actor, hiddenByManager.slug)).toBeNull();
    }
  });

  it("reveals a trip at once when its creator makes it visible, and hides it again", () => {
    updateTrip(db, cast.manager, hiddenByManager.id, tripInput({ title: "Caché (Lucie)", isVisible: true }));
    expect(getTripBySlug(db, null, hiddenByManager.slug)?.id).toBe(hiddenByManager.id);
    expect(titles(cast.guest)).toHaveLength(2);

    updateTrip(db, cast.manager, hiddenByManager.id, tripInput({ title: "Caché (Lucie)", isVisible: false }));
    expect(getTripBySlug(db, null, hiddenByManager.slug)).toBeNull();
    expect(titles(cast.guest)).toEqual(["Visible"]);
  });

  it("hands a trip over to the superuser alone when its creator's account is deleted", () => {
    db.delete(users).where(eq(users.id, cast.manager.id)).run();
    const orphan = getTripById(db, cast.superuser, hiddenByManager.id);
    expect(orphan).toMatchObject({ authorId: null, title: "Caché (Lucie)" });
    expect(orphan && getTripAuthorName(db, orphan)).toBeNull();
    expect(titles(otherManager)).toEqual(["Visible"]);
    expect(updateTrip(db, cast.superuser, hiddenByManager.id, tripInput({ isVisible: true })).ok).toBe(true);
  });
});

describe("deleting trips", () => {
  const addEntry = (trip: Trip, status: "draft" | "published" = "published") =>
    db
      .insert(entries)
      .values({ tripId: trip.id, authorId: cast.publisher.id, date: "2026-11-11", title: "Jour 1", status })
      .returning()
      .get();

  it("is reserved to the creator of the trip and the superuser", () => {
    const trip = mustCreate(cast.manager);
    for (const actor of [null, cast.guest, cast.publisher, otherManager]) {
      expect(deleteTrip(db, actor, trip.id)).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(exists(trip)).toBe(true);
  });

  it("lets the creator delete their trip with all its entries, comments and reactions", () => {
    const trip = mustCreate(cast.manager);
    const other = mustCreate(cast.superuser, { title: "Autre" });
    const entry = addEntry(trip);
    addEntry(trip, "draft");
    const kept = addEntry(other);
    const commentId = db.insert(comments).values({ entryId: entry.id, authorId: cast.guest.id, body: "Super" }).returning().get().id;
    db.insert(reactions).values({ userId: cast.guest.id, entryId: entry.id, type: "love" }).run();
    db.insert(reactions).values({ userId: cast.guest.id, commentId, type: "like" }).run();
    expect(countTripEntries(db, trip.id)).toBe(2);

    expect(deleteTrip(db, cast.manager, trip.id)).toEqual({ ok: true });

    expect(exists(trip)).toBe(false);
    expect(db.select().from(comments).all()).toHaveLength(0);
    expect(db.select().from(reactions).all()).toHaveLength(0);
    // Other trips are untouched.
    expect(exists(other)).toBe(true);
    expect(db.select().from(entries).all().map((row) => row.id)).toEqual([kept.id]);
  });

  it("lets the superuser delete any trip", () => {
    const trip = mustCreate(cast.manager);
    addEntry(trip);
    expect(deleteTrip(db, cast.superuser, trip.id)).toEqual({ ok: true });
    expect(exists(trip)).toBe(false);
    expect(deleteTrip(db, cast.superuser, 9999)).toEqual({ ok: false, reason: "trip_not_found" });
  });
});
