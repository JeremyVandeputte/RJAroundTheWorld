import { beforeEach, describe, expect, it } from "vitest";
import { distanceKm } from "@/lib/geo";
import type { Db } from "@/server/db/client";
import { media } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { createEntry, type Entry } from "@/server/services/entries";
import { journalStats } from "@/server/services/stats";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let trip: Trip;
let counter = 0;

function entry(intent: "save" | "publish", overrides = {}, author: Actor = cast.publisher, inTrip = trip): Entry {
  const result = createEntry(db, author, inTrip.id, entryInput({ peopleIds: [cast.guest.id], ...overrides }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}

function addMedia(target: Entry, kind: "photo" | "video") {
  counter += 1;
  db.insert(media)
    .values({
      publicId: `stat-${counter}`.padEnd(22, "x"),
      entryId: target.id,
      uploaderId: target.authorId,
      kind,
      filePath: `${target.id}/${counter}`,
      mimeType: kind === "photo" ? "image/jpeg" : "video/mp4",
      sizeBytes: 0,
    })
    .run();
}

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  trip = makeTrip(db, cast.superuser, { title: "Martinique" });
});

describe("distanceKm", () => {
  it("measures straight-line distances", () => {
    expect(distanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 })).toBeCloseTo(344, -1);
    expect(distanceKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0);
  });
});

describe("journal statistics", () => {
  it("count published entries, days, media and routes per trip", () => {
    const plage = entry("publish", { title: "Plage", date: "2026-11-11", newTags: ["Plage"] });
    const rando = entry("publish", {
      title: "Rando",
      date: "2026-11-11",
      pointA: { lat: 14.8, lng: -61.17, name: "" },
      pointB: { lat: 14.9, lng: -61.17, name: "" },
      newTags: ["Plage", "Randonnée"],
      peopleIds: [cast.guest.id, cast.otherPublisher.id],
    });
    entry("publish", { title: "Marché", date: "2026-11-12" }, cast.superuser);
    const draft = entry("save", { title: "Brouillon", date: "2026-11-20" });
    addMedia(plage, "photo");
    addMedia(plage, "photo");
    addMedia(rando, "video");
    addMedia(draft, "photo");

    const stats = journalStats(db, cast.guest);
    expect(stats.trips).toHaveLength(1);
    expect(stats.trips[0]).toMatchObject({ entries: 3, days: 2, photos: 2, videos: 1 });
    expect(stats.trips[0]!.routeKm).toBeCloseTo(11.1, 0);
    expect(stats.totals).toMatchObject({ trips: 1, entries: 3, days: 2, photos: 2, videos: 1 });

    expect(stats.tags.map((tag) => [tag.name, tag.count])).toEqual([
      ["plage", 2],
      ["randonnée", 1],
    ]);
    expect(stats.authors.map((author) => [author.id, author.count])).toEqual([
      [cast.publisher.id, 2],
      [cast.superuser.id, 1],
    ]);
    expect(stats.people.map((person) => [person.id, person.count])).toEqual([
      [cast.guest.id, 3],
      [cast.otherPublisher.id, 1],
    ]);
  });

  it("only count what the viewer may see", () => {
    entry("publish", { title: "Visible" });
    const hidden = makeTrip(db, cast.superuser, { title: "Surprise", isVisible: false });
    entry("publish", { title: "Cachée" }, cast.superuser, hidden);

    expect(journalStats(db, cast.guest).totals).toMatchObject({ trips: 1, entries: 1 });
    expect(journalStats(db, cast.superuser).totals).toMatchObject({ trips: 2, entries: 2 });
    expect(journalStats(db, null).totals).toMatchObject({ trips: 0, entries: 0 });
  });

  it("list a trip without published entries with zeros", () => {
    entry("save");
    const stats = journalStats(db, cast.publisher);
    expect(stats.trips[0]).toMatchObject({ entries: 0, days: 0, photos: 0, videos: 0, routeKm: 0 });
    expect(stats.tags).toEqual([]);
    expect(stats.authors).toEqual([]);
  });
});
