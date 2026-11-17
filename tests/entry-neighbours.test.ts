import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { createEntry, findEntryNeighbours, type Entry } from "@/server/services/entries";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let trip: Trip;

function entry(intent: "save" | "publish", overrides = {}, author: Actor = cast.publisher): Entry {
  const result = createEntry(db, author, trip.id, entryInput({ peopleIds: [cast.guest.id], ...overrides }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}
const titles = (found: ReturnType<typeof findEntryNeighbours>) => [found.previous?.title ?? null, found.next?.title ?? null];

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  trip = makeTrip(db, cast.superuser);
});

describe("previous and next entries", () => {
  it("follow the days of the trip: previous happened before, next after", () => {
    const first = entry("publish", { title: "Arrivée", date: "2026-11-01" });
    const second = entry("publish", { title: "Plage", date: "2026-11-03" });
    const third = entry("publish", { title: "Volcan", date: "2026-11-05" });

    expect(titles(findEntryNeighbours(db, cast.guest, trip, second.id))).toEqual(["Arrivée", "Volcan"]);
    expect(titles(findEntryNeighbours(db, cast.guest, trip, first.id))).toEqual([null, "Plage"]);
    expect(titles(findEntryNeighbours(db, cast.guest, trip, third.id))).toEqual(["Plage", null]);
    expect(findEntryNeighbours(db, cast.guest, trip, second.id).previous).toEqual({ id: first.id, title: "Arrivée", date: "2026-11-01" });
  });

  it("order entries of the same day as the journal does", () => {
    const morning = entry("publish", { title: "Matin", date: "2026-11-03" });
    const evening = entry("publish", { title: "Soir", date: "2026-11-03" });
    expect(titles(findEntryNeighbours(db, cast.guest, trip, morning.id))).toEqual([null, "Soir"]);
    expect(titles(findEntryNeighbours(db, cast.guest, trip, evening.id))).toEqual(["Matin", null]);
  });

  it("only go through entries the person can see", () => {
    entry("publish", { title: "Arrivée", date: "2026-11-01" });
    entry("save", { title: "Brouillon", date: "2026-11-02" });
    const third = entry("publish", { title: "Volcan", date: "2026-11-05" });
    // The draft is skipped for a reader, but not for its author.
    expect(titles(findEntryNeighbours(db, cast.guest, trip, third.id))).toEqual(["Arrivée", null]);
    expect(titles(findEntryNeighbours(db, cast.publisher, trip, third.id))).toEqual(["Brouillon", null]);
  });

  it("stay within the journal's filters, or browse everything when the entry is outside them", () => {
    entry("publish", { title: "Plage 1", date: "2026-11-01", newTags: ["Baignade"] });
    const hike = entry("publish", { title: "Rando", date: "2026-11-02" });
    const beach = entry("publish", { title: "Plage 2", date: "2026-11-03", newTags: ["Baignade"] });
    const filters = { date: null, tagSlugs: ["baignade"] };

    expect(titles(findEntryNeighbours(db, cast.guest, trip, beach.id, filters))).toEqual(["Plage 1", null]);
    expect(titles(findEntryNeighbours(db, cast.guest, trip, hike.id, filters))).toEqual(["Plage 1", "Plage 2"]);
  });

  it("give nothing for an entry that is not in the trip", () => {
    expect(findEntryNeighbours(db, cast.guest, trip, 9999)).toEqual({ previous: null, next: null });
  });
});
