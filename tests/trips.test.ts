import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { trips } from "@/server/db/schema";
import { createTrip, getTripById, getTripBySlug, listTrips, updateTrip, type Trip } from "@/server/services/trips";
import { insertCast, tripInput } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;

function mustCreate(overrides = {}): Trip {
  const result = createTrip(db, cast.superuser, tripInput(overrides));
  if (!result.ok) throw new Error(result.reason);
  return result.trip;
}

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
});

describe("creating and editing trips", () => {
  it("is reserved to the superuser", () => {
    for (const actor of [null, cast.guest, cast.publisher]) {
      expect(createTrip(db, actor, tripInput())).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(db.select().from(trips).all()).toHaveLength(0);

    const trip = mustCreate({ isVisible: false });
    for (const actor of [null, cast.guest, cast.publisher]) {
      expect(updateTrip(db, actor, trip.id, tripInput({ isVisible: true }))).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(getTripById(db, cast.superuser, trip.id)?.isVisible).toBe(false);
  });

  it("builds a unique slug from the title and never changes it", () => {
    const first = mustCreate({ title: "Séjour en Martinique" });
    const second = mustCreate({ title: "Séjour en Martinique" });
    const reserved = mustCreate({ title: "New" });
    const symbols = mustCreate({ title: "???" });
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

  it("reports an unknown trip", () => {
    expect(updateTrip(db, cast.superuser, 9999, tripInput())).toEqual({ ok: false, reason: "trip_not_found" });
  });
});

describe("trip visibility", () => {
  let visible: Trip;
  let hidden: Trip;

  beforeEach(() => {
    visible = mustCreate({ title: "Visible", startDate: "2026-11-01" });
    hidden = mustCreate({ title: "Caché", startDate: "2027-06-01", endDate: "2027-06-15", isVisible: false });
  });

  it("lists hidden trips only for the superuser and users with Publier", () => {
    const titles = (actor: Parameters<typeof listTrips>[1]) => listTrips(db, actor).map((trip) => trip.title);
    expect(titles(null)).toEqual(["Visible"]);
    expect(titles(cast.guest)).toEqual(["Visible"]);
    expect(titles(cast.publisher)).toEqual(["Caché", "Visible"]);
    expect(titles(cast.superuser)).toEqual(["Caché", "Visible"]);
  });

  it("answers exactly like an unknown trip when a hidden trip is requested directly", () => {
    for (const actor of [null, cast.guest]) {
      expect(getTripBySlug(db, actor, hidden.slug)).toBeNull();
      expect(getTripById(db, actor, hidden.id)).toBeNull();
      expect(getTripBySlug(db, actor, "does-not-exist")).toBeNull();
    }
    expect(getTripBySlug(db, cast.publisher, hidden.slug)?.id).toBe(hidden.id);
    expect(getTripBySlug(db, null, visible.slug)?.id).toBe(visible.id);
  });

  it("hides hidden trips from deactivated accounts and accounts awaiting a password change", () => {
    const locked = { ...cast.publisher, mustChangePassword: true };
    const deactivated = { ...cast.publisher, isActive: false };
    for (const actor of [locked, deactivated]) {
      expect(listTrips(db, actor).map((trip) => trip.title)).toEqual(["Visible"]);
      expect(getTripBySlug(db, actor, hidden.slug)).toBeNull();
    }
  });

  it("reveals a trip at once when it becomes visible, and hides it again", () => {
    updateTrip(db, cast.superuser, hidden.id, tripInput({ title: "Caché", isVisible: true }));
    expect(getTripBySlug(db, null, hidden.slug)?.id).toBe(hidden.id);
    expect(listTrips(db, null)).toHaveLength(2);

    updateTrip(db, cast.superuser, hidden.id, tripInput({ title: "Caché", isVisible: false }));
    expect(getTripBySlug(db, null, hidden.slug)).toBeNull();
    expect(listTrips(db, cast.guest)).toHaveLength(1);
  });
});
