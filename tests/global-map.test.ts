import { beforeEach, describe, expect, it } from "vitest";
import { TRIP_COLORS, tripColor } from "@/lib/map-colors";
import type { Db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { createEntry, updateEntry, type Entry } from "@/server/services/entries";
import { listGlobalMap } from "@/server/services/global-map";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;

function entry(trip: Trip, intent: "save" | "publish", overrides = {}, author: Actor = cast.publisher): Entry {
  const result = createEntry(db, author, trip.id, entryInput({ peopleIds: [cast.guest.id], ...overrides }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
});

describe("map of all trips", () => {
  it("groups the published places by trip, most recent trip first", () => {
    const martinique = makeTrip(db, cast.superuser, { title: "Martinique", startDate: "2026-11-01", endDate: "2027-01-31" });
    const islande = makeTrip(db, cast.superuser, { title: "Islande", startDate: "2027-06-01", endDate: "2027-06-20" });
    entry(martinique, "publish", { title: "Plage" });
    entry(martinique, "publish", { title: "Volcan", pointB: { lat: 14.8, lng: -61.2, name: "Sommet" } });
    entry(islande, "publish", { title: "Geysir" });

    const map = listGlobalMap(db, cast.guest);
    expect(map.map((item) => item.trip.title)).toEqual(["Islande", "Martinique"]);
    expect(map[1]!.entries.map((item) => item.title)).toEqual(["Plage", "Volcan"]);
    expect(map[1]!.entries[1]!.pointB).toMatchObject({ lat: 14.8, lng: -61.2 });
  });

  it("never shows drafts, entries without a place, or trips with nothing to show", () => {
    const trip = makeTrip(db, cast.superuser, { title: "Martinique" });
    const empty = makeTrip(db, cast.superuser, { title: "Sans lieu" });
    entry(trip, "publish", { title: "Publiée" });
    entry(trip, "save", { title: "Brouillon" });
    entry(empty, "save", { title: "Brouillon ailleurs" });

    expect(listGlobalMap(db, cast.publisher)).toEqual([
      expect.objectContaining({ trip: expect.objectContaining({ title: "Martinique" }), entries: [expect.objectContaining({ title: "Publiée" })] }),
    ]);
  });

  it("follows the visibility of each trip", () => {
    const hidden = makeTrip(db, cast.superuser, { title: "Secret", isVisible: false });
    const published = entry(hidden, "publish", { title: "Cachée" }, cast.superuser);
    expect(published.status).toBe("published");

    expect(listGlobalMap(db, cast.guest)).toEqual([]);
    expect(listGlobalMap(db, cast.publisher)).toEqual([]);
    expect(listGlobalMap(db, null)).toEqual([]);
    // The superuser sees it, as on the trip's own map.
    expect(listGlobalMap(db, cast.superuser).map((item) => item.trip.title)).toEqual(["Secret"]);
  });

  it("removes a place as soon as its entry is withdrawn", () => {
    const trip = makeTrip(db, cast.superuser);
    const published = entry(trip, "publish");
    expect(listGlobalMap(db, cast.guest)).toHaveLength(1);
    const withdrawn = updateEntry(db, cast.publisher, published.id, entryInput({ peopleIds: [cast.guest.id] }), "unpublish");
    expect(withdrawn.ok).toBe(true);
    expect(listGlobalMap(db, cast.guest)).toEqual([]);
  });
});

describe("trip colours", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };

  it("are distinct, valid colours that repeat after the palette", () => {
    expect(new Set(TRIP_COLORS.map((color) => color.fill)).size).toBe(TRIP_COLORS.length);
    for (const color of TRIP_COLORS) expect(color.fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(tripColor(0)).toBe(TRIP_COLORS[0]);
    expect(tripColor(TRIP_COLORS.length + 2)).toBe(TRIP_COLORS[2]);
  });

  it("label each marker with the letter colour that reads best on it", () => {
    for (const { fill, label } of TRIP_COLORS) {
      const other = label === "#ffffff" ? "#1f2933" : "#ffffff";
      expect(contrast(fill, label)).toBeGreaterThan(contrast(fill, other));
      expect(contrast(fill, label)).toBeGreaterThanOrEqual(3.9);
    }
  });
});
