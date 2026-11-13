import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { entryTags, tags } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { createEntry, getEntry, listEntries, updateEntry, type Entry, type EntryInput } from "@/server/services/entries";
import {
  createTag,
  deleteTag,
  ensureTags,
  isValidTagName,
  listTags,
  listTagsWithUsage,
  renameTag,
} from "@/server/services/tags";
import { createTrip, type Trip } from "@/server/services/trips";
import { entryInput, insertCast, tripInput } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let trip: Trip;

const names = (actor: Actor = cast.guest) => listTags(db, actor).map((tag) => tag.name);
const idOf = (name: string) => listTags(db, cast.superuser).find((tag) => tag.name === name)!.id;
const input = (overrides: Partial<EntryInput> = {}) => entryInput({ peopleIds: [cast.guest.id], ...overrides });

function mustEntry(overrides: Partial<EntryInput> = {}, intent: "save" | "publish" = "publish"): Entry {
  const result = createEntry(db, cast.publisher, trip.id, input(overrides), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}
const tagsOf = (entry: Entry) => getEntry(db, cast.superuser, trip, entry.id)?.tags.map((tag) => tag.name);

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  const created = createTrip(db, cast.superuser, tripInput());
  if (!created.ok) throw new Error(created.reason);
  trip = created.trip;
});

describe("starting list", () => {
  it("is created by the migration, sorted alphabetically", () => {
    expect(names()).toEqual([
      "baignade",
      "culture",
      "détente",
      "faune et flore",
      "nourriture",
      "paysage",
      "plage",
      "randonnée",
      "sortie en mer",
      "ville",
    ]);
  });

  it("is only listed to logged-in accounts", () => {
    expect(listTags(db, null)).toEqual([]);
    expect(listTags(db, { ...cast.guest, isActive: false })).toEqual([]);
  });
});

describe("tag names", () => {
  it("are 1 to 30 characters with at least one letter or digit", () => {
    expect(isValidTagName("plage")).toBe(true);
    expect(isValidTagName("  coucher   de soleil ")).toBe(true);
    for (const name of ["", "   ", "!!!", "x".repeat(31)]) expect(isValidTagName(name), name).toBe(false);
  });

  it("ignore case and accents: a name that only differs by those reuses the existing tag", () => {
    const [plage] = ensureTags(db, ["PLAGE"]);
    const [detente] = ensureTags(db, ["Detente"]);
    expect(plage).toBe(idOf("plage"));
    expect(detente).toBe(idOf("détente"));
    expect(db.select().from(tags).all()).toHaveLength(10);
  });

  it("are cleaned of extra spaces when created", () => {
    ensureTags(db, ["  coucher   de  soleil "]);
    expect(names()).toContain("coucher de soleil");
  });
});

describe("tags of an entry", () => {
  it("are chosen among existing tags", () => {
    const entry = mustEntry({ tagIds: [idOf("plage"), idOf("baignade")] });
    expect(tagsOf(entry)).toEqual(["baignade", "plage"]);
  });

  it("can include new tags typed by the author, created on save", () => {
    const entry = mustEntry({ tagIds: [idOf("plage")], newTags: ["Snorkeling", "plage"] });
    expect(tagsOf(entry)).toEqual(["plage", "Snorkeling"]);
    expect(names()).toContain("Snorkeling");
    // "plage" typed again was not duplicated.
    expect(db.select().from(tags).all()).toHaveLength(11);
  });

  it("are replaced on update, and kept when the update leaves tags out", () => {
    const entry = mustEntry({ tagIds: [idOf("plage")] });
    updateEntry(db, cast.publisher, entry.id, input({ tagIds: [idOf("ville")], newTags: [] }), "save");
    expect(tagsOf(entry)).toEqual(["ville"]);
    updateEntry(db, cast.publisher, entry.id, input(), "save");
    expect(tagsOf(entry)).toEqual(["ville"]);
    updateEntry(db, cast.publisher, entry.id, input({ tagIds: [], newTags: [] }), "save");
    expect(tagsOf(entry)).toEqual([]);
  });

  it("are optional, even to publish", () => {
    expect(mustEntry({}, "publish").status).toBe("published");
  });

  it("refuse unknown tags and invalid new names, saving nothing", () => {
    expect(createEntry(db, cast.publisher, trip.id, input({ tagIds: [9999] }), "save")).toEqual({
      ok: false,
      reason: "invalid_tags",
    });
    expect(createEntry(db, cast.publisher, trip.id, input({ newTags: ["!!!"] }), "save")).toEqual({
      ok: false,
      reason: "invalid_tag_name",
    });
    expect(db.select().from(entryTags).all()).toHaveLength(0);
    expect(db.select().from(tags).all()).toHaveLength(10);
  });

  it("cannot be created by someone who cannot write entries", () => {
    expect(createEntry(db, cast.guest, trip.id, input({ newTags: ["Intrus"] }), "save")).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(names()).not.toContain("Intrus");
  });

  it("are listed with each entry of a trip", () => {
    mustEntry({ title: "Plage", tagIds: [idOf("plage")] });
    mustEntry({ title: "Sans tag" });
    const listed = listEntries(db, cast.guest, trip).map((entry) => [entry.title, entry.tags.map((tag) => tag.slug)]);
    expect(listed).toEqual(
      expect.arrayContaining([
        ["Plage", ["plage"]],
        ["Sans tag", []],
      ]),
    );
  });
});

describe("administration of tags", () => {
  it("is reserved to the superuser", () => {
    for (const actor of [null, cast.guest, cast.publisher, cast.manager]) {
      expect(renameTag(db, actor, idOf("plage"), "Plages")).toEqual({ ok: false, reason: "forbidden" });
      expect(deleteTag(db, actor, idOf("plage"))).toEqual({ ok: false, reason: "forbidden" });
      expect(createTag(db, actor, "Volcan")).toEqual({ ok: false, reason: "forbidden" });
      expect(listTagsWithUsage(db, actor)).toBeNull();
    }
    expect(names()).toContain("plage");
  });

  it("renames a tag everywhere it is used", () => {
    const entry = mustEntry({ tagIds: [idOf("plage")] });
    expect(renameTag(db, cast.superuser, idOf("plage"), "  Plages  de sable ")).toEqual({ ok: true });
    expect(tagsOf(entry)).toEqual(["Plages de sable"]);
  });

  it("refuses a name already used by another tag", () => {
    expect(renameTag(db, cast.superuser, idOf("plage"), "Ville")).toEqual({ ok: false, reason: "tag_exists" });
    // Changing only the case of its own name is fine.
    expect(renameTag(db, cast.superuser, idOf("plage"), "Plage")).toEqual({ ok: true });
    expect(renameTag(db, cast.superuser, idOf("Plage"), "")).toEqual({ ok: false, reason: "invalid_tag_name" });
    expect(renameTag(db, cast.superuser, 9999, "x")).toEqual({ ok: false, reason: "tag_not_found" });
  });

  it("deletes a tag, removing it from every entry", () => {
    const entry = mustEntry({ tagIds: [idOf("plage"), idOf("ville")] });
    expect(deleteTag(db, cast.superuser, idOf("plage"))).toEqual({ ok: true });
    expect(tagsOf(entry)).toEqual(["ville"]);
    expect(names()).not.toContain("plage");
    expect(deleteTag(db, cast.superuser, 9999)).toEqual({ ok: false, reason: "tag_not_found" });
  });

  it("creates tags and counts their use", () => {
    expect(createTag(db, cast.superuser, "Volcan")).toEqual({ ok: true });
    expect(createTag(db, cast.superuser, "volcan")).toEqual({ ok: false, reason: "tag_exists" });
    mustEntry({ tagIds: [idOf("Volcan")] });
    mustEntry({ tagIds: [idOf("Volcan"), idOf("plage")] });
    const usage = Object.fromEntries(listTagsWithUsage(db, cast.superuser)!.map((tag) => [tag.name, tag.entryCount]));
    expect(usage).toMatchObject({ Volcan: 2, plage: 1, ville: 0 });
  });
});
