import { beforeEach, describe, expect, it } from "vitest";
import { filtersToQuery, hasActiveFilters, matchesFilters, parseTripFilters } from "@/lib/trip-filters";
import type { Db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import {
  createEntry,
  listEntries,
  listTripFilterOptions,
  listTripMapEntries,
  type EntryInput,
} from "@/server/services/entries";
import { listTags } from "@/server/services/tags";
import { createTrip, type Trip } from "@/server/services/trips";
import { entryInput, insertCast, tripInput, makeTrip } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

describe("reading filters from the address", () => {
  it("reads a day and tags, in both forms", () => {
    expect(parseTripFilters({ jour: "2026-11-14", tags: "plage,randonnee" })).toEqual({
      date: "2026-11-14",
      tagSlugs: ["plage", "randonnee"],
    });
    expect(parseTripFilters({ tags: ["plage", "ville"] })).toEqual({ date: null, tagSlugs: ["plage", "ville"] });
    expect(parseTripFilters({})).toEqual({ date: null, tagSlugs: [] });
  });

  it("ignores anything malformed", () => {
    expect(parseTripFilters({ jour: "2026-02-30", tags: "Plage,<script>, ,a--b,plage,plage" })).toEqual({
      date: null,
      tagSlugs: ["plage"],
    });
    expect(parseTripFilters({ jour: ["2026-11-14", "2026-11-15"] }).date).toBeNull();
    expect(parseTripFilters({ tags: Array.from({ length: 50 }, (_, i) => `t${i}`).join(",") }).tagSlugs).toHaveLength(20);
  });

  it("writes them back into the address", () => {
    expect(filtersToQuery({ date: "2026-11-14", tagSlugs: ["plage", "ville"] })).toBe("?jour=2026-11-14&tags=plage%2Cville");
    expect(filtersToQuery({ date: null, tagSlugs: [] })).toBe("");
    expect(hasActiveFilters({ date: null, tagSlugs: [] })).toBe(false);
    expect(hasActiveFilters({ date: null, tagSlugs: ["plage"] })).toBe(true);
  });

  it("keeps an entry that has at least one of the tags, on the chosen day", () => {
    const entry = { date: "2026-11-14", tagSlugs: ["plage", "baignade"] };
    expect(matchesFilters({ date: null, tagSlugs: [] }, entry)).toBe(true);
    expect(matchesFilters({ date: null, tagSlugs: ["ville", "plage"] }, entry)).toBe(true);
    expect(matchesFilters({ date: null, tagSlugs: ["ville"] }, entry)).toBe(false);
    expect(matchesFilters({ date: "2026-11-14", tagSlugs: ["plage"] }, entry)).toBe(true);
    expect(matchesFilters({ date: "2026-11-15", tagSlugs: ["plage"] }, entry)).toBe(false);
  });
});

describe("filtering a trip", () => {
  let db: Db;
  let cast: ReturnType<typeof insertCast>;
  let trip: Trip;
  const idOf = (slug: string) => listTags(db, cast.superuser).find((tag) => tag.slug === slug)!.id;

  function add(title: string, date: string, tagSlugs: string[], intent: "save" | "publish" = "publish", overrides: Partial<EntryInput> = {}) {
    const result = createEntry(
      db,
      cast.publisher,
      trip.id,
      entryInput({ title, date, peopleIds: [cast.guest.id], tagIds: tagSlugs.map(idOf), ...overrides }),
      intent,
    );
    if (!result.ok) throw new Error(result.reason);
  }
  const titles = (filters: Parameters<typeof listEntries>[3], actor: Actor = cast.guest) =>
    listEntries(db, actor, trip, filters).map((entry) => entry.title);

  beforeEach(() => {
    db = createTestDb();
    cast = insertCast(db);
    trip = makeTrip(db, cast.superuser);
    add("Salines", "2026-11-11", ["plage", "baignade"]);
    add("Pelée", "2026-11-14", ["randonnee", "paysage"]);
    add("Marché", "2026-11-14", ["nourriture", "ville"]);
    add("Sans tag", "2026-11-15", []);
    add("Brouillon plage", "2026-11-16", ["plage"], "save");
  });

  it("by day", () => {
    expect(titles({ date: "2026-11-14", tagSlugs: [] }).sort()).toEqual(["Marché", "Pelée"]);
    expect(titles({ date: "2026-11-12", tagSlugs: [] })).toEqual([]);
  });

  it("by one or several tags: at least one of them", () => {
    expect(titles({ date: null, tagSlugs: ["plage"] })).toEqual(["Salines"]);
    expect(titles({ date: null, tagSlugs: ["plage", "randonnee"] })).toEqual(["Pelée", "Salines"]);
    expect(titles({ date: null, tagSlugs: ["inconnu"] })).toEqual([]);
  });

  it("by day and tags together", () => {
    expect(titles({ date: "2026-11-14", tagSlugs: ["ville", "plage"] })).toEqual(["Marché"]);
  });

  it("never brings back what the viewer cannot see", () => {
    // The draft is tagged "plage" but only its author sees it.
    expect(titles({ date: null, tagSlugs: ["plage"] }, cast.publisher)).toEqual(["Brouillon plage", "Salines"]);
    expect(titles({ date: null, tagSlugs: ["plage"] }, cast.guest)).toEqual(["Salines"]);
    expect(titles({ date: null, tagSlugs: ["plage"] }, null)).toEqual([]);
  });

  it("offers only the days and tags actually used by visible entries", () => {
    const options = listTripFilterOptions(db, cast.guest, trip);
    expect(options.days).toEqual(["2026-11-15", "2026-11-14", "2026-11-11"]);
    expect(options.tags.map((tag) => tag.slug)).toEqual(["baignade", "nourriture", "paysage", "plage", "randonnee", "ville"]);
    expect(options.total).toBe(4);
    // The author also gets the day of their draft.
    expect(listTripFilterOptions(db, cast.publisher, trip).days[0]).toBe("2026-11-16");
  });

  it("applies to the trip map as well", () => {
    const onMap = (filters: Parameters<typeof listTripMapEntries>[3]) =>
      listTripMapEntries(db, cast.guest, trip, filters).map((entry) => entry.title).sort();
    expect(onMap({ date: null, tagSlugs: [] })).toEqual(["Marché", "Pelée", "Salines", "Sans tag"]);
    expect(onMap({ date: null, tagSlugs: ["plage", "ville"] })).toEqual(["Marché", "Salines"]);
    expect(onMap({ date: "2026-11-14", tagSlugs: ["randonnee"] })).toEqual(["Pelée"]);
  });
});
