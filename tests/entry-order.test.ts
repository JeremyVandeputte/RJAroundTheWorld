import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import {
  createEntry,
  findEntryNeighbours,
  listEntries,
  listTripMapEntries,
  moveEntry,
  updateEntry,
  type Entry,
} from "@/server/services/entries";
import { searchEntries } from "@/server/services/search";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let trip: Trip;

function entry(title: string, date = "2026-11-03", intent: "save" | "publish" = "publish", author: Actor = cast.publisher): Entry {
  const result = createEntry(db, author, trip.id, entryInput({ title, date, peopleIds: [cast.guest.id] }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}
const journal = (actor: Actor = cast.superuser) => listEntries(db, actor, trip).map((item) => item.title);

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  // The trip belongs to Lucie, who has "Gérer les voyages".
  trip = makeTrip(db, cast.manager);
});

describe("order of the entries of a day", () => {
  it("shows the entry written last first, as before", () => {
    entry("Matin");
    entry("Midi");
    entry("Soir");
    entry("Veille", "2026-11-02");
    expect(journal()).toEqual(["Soir", "Midi", "Matin", "Veille"]);
  });

  it("moves an entry up or down in the journal, and everywhere else", () => {
    const morning = entry("Plage le matin");
    entry("Plage à midi");
    const evening = entry("Plage le soir");

    expect(moveEntry(db, cast.manager, morning.id, "up")).toMatchObject({ ok: true, moved: true });
    expect(journal()).toEqual(["Plage le soir", "Plage le matin", "Plage à midi"]);
    expect(moveEntry(db, cast.manager, evening.id, "down")).toMatchObject({ ok: true, moved: true });
    expect(journal()).toEqual(["Plage le matin", "Plage le soir", "Plage à midi"]);

    // The previous/next links, the map (oldest first) and the search follow.
    expect(findEntryNeighbours(db, cast.guest, trip, evening.id).next?.title).toBe("Plage le matin");
    expect(listTripMapEntries(db, cast.guest, trip).map((item) => item.title)).toEqual(["Plage à midi", "Plage le soir", "Plage le matin"]);
    expect(searchEntries(db, cast.guest, "plage").results.map((result) => result.entryId)).toEqual(
      listEntries(db, cast.guest, trip).map((item) => item.id),
    );
  });

  it("does nothing past the top or the bottom of the day", () => {
    entry("Matin");
    const evening = entry("Soir");
    const other = entry("Lendemain", "2026-11-04");
    expect(moveEntry(db, cast.manager, evening.id, "up")).toMatchObject({ ok: true, moved: false });
    // Never into another day.
    expect(moveEntry(db, cast.manager, other.id, "down")).toMatchObject({ ok: true, moved: false });
    expect(journal()).toEqual(["Lendemain", "Soir", "Matin"]);
  });

  it("is for the people who can modify the trip only", () => {
    const morning = entry("Matin");
    entry("Soir");
    expect(moveEntry(db, cast.superuser, morning.id, "up")).toMatchObject({ ok: true, moved: true });
    // The author of the entries, a reader, someone logged out: not their trip.
    for (const actor of [cast.publisher, cast.guest, cast.otherPublisher]) {
      expect(moveEntry(db, actor, morning.id, "down")).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(moveEntry(db, null, morning.id, "down")).toEqual({ ok: false, reason: "not_found" });
    expect(moveEntry(db, cast.manager, 9999, "down")).toEqual({ ok: false, reason: "not_found" });
    expect(journal()).toEqual(["Matin", "Soir"]);
  });

  it("leaves the drafts the person cannot see where they are", () => {
    const first = entry("Arrivée");
    entry("Brouillon de Romane", "2026-11-03", "save");
    entry("Coucher de soleil");
    expect(journal(cast.manager)).toEqual(["Coucher de soleil", "Arrivée"]);

    moveEntry(db, cast.manager, first.id, "up");
    expect(journal(cast.manager)).toEqual(["Arrivée", "Coucher de soleil"]);
    expect(journal(cast.superuser)).toEqual(["Arrivée", "Brouillon de Romane", "Coucher de soleil"]);
  });

  it("puts an entry moved to another day first in that day", () => {
    entry("Matin du 4", "2026-11-04");
    entry("Soir du 4", "2026-11-04");
    const moved = entry("Écrite pour le 3");
    const result = updateEntry(db, cast.publisher, moved.id, entryInput({ title: "Écrite pour le 3", date: "2026-11-04", peopleIds: [cast.guest.id] }), "save");
    expect(result.ok).toBe(true);
    expect(journal()).toEqual(["Écrite pour le 3", "Soir du 4", "Matin du 4"]);
    // Saving it again on the same day does not move it.
    const first = listEntries(db, cast.superuser, trip).at(-1)!;
    moveEntry(db, cast.manager, first.id, "up");
    updateEntry(db, cast.publisher, moved.id, entryInput({ title: "Écrite pour le 3", date: "2026-11-04", peopleIds: [cast.guest.id] }), "save");
    expect(journal()).toEqual(["Écrite pour le 3", "Matin du 4", "Soir du 4"]);
  });
});
