import { beforeEach, describe, expect, it } from "vitest";
import { plainText } from "@/lib/rich-text";
import { excerpt, foldForSearch, highlight, matchesAllTerms, searchTerms, type Segment } from "@/lib/search";
import type { Db } from "@/server/db/client";
import type { Actor } from "@/server/permissions";
import { createEntry, type Entry } from "@/server/services/entries";
import { MAX_SEARCH_RESULTS, searchEntries } from "@/server/services/search";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

const marked = (segments: Segment[]) => segments.filter((segment) => segment.match).map((segment) => segment.text);
const joined = (segments: Segment[]) => segments.map((segment) => segment.text).join("");

describe("search helpers", () => {
  it("ignore case and accents, ligatures included", () => {
    expect(foldForSearch("Forêt ÉPAISSE, cœur")).toBe("foret epaisse, coeur");
    expect(searchTerms("  Forêt   forêt l’été ")).toEqual(["foret", "l'ete"]);
    expect(searchTerms("!!! ")).toEqual([]);
  });

  it("require every word", () => {
    expect(matchesAllTerms("Randonnée dans la forêt", searchTerms("foret rando"))).toBe(true);
    expect(matchesAllTerms("Randonnée dans la forêt", searchTerms("foret plage"))).toBe(false);
    expect(matchesAllTerms("anything", [])).toBe(false);
  });

  it("highlight the original text, accents kept", () => {
    expect(marked(highlight("Le Cœur de la Forêt", searchTerms("coeur foret")))).toEqual(["Cœur", "Forêt"]);
    expect(joined(highlight("Le Cœur de la Forêt", ["coeur"]))).toBe("Le Cœur de la Forêt");
  });

  it("cut a passage around the first match, at word boundaries", () => {
    const text = `${"Une longue introduction sans intérêt. ".repeat(10)}Puis le volcan apparaît enfin. ${"Suite du récit. ".repeat(10)}`;
    const passage = excerpt(text, ["volcan"], 120);
    expect(marked(passage)).toEqual(["volcan"]);
    expect(passage[0]).toEqual({ text: "…", match: false });
    expect(passage.at(-1)).toEqual({ text: "…", match: false });
    const inner = joined(passage.slice(1, -1));
    expect(inner.length).toBeLessThanOrEqual(120);
    expect(text.includes(inner)).toBe(true);
    expect(inner.startsWith(" ") || inner.endsWith(" ")).toBe(false);
  });

  it("start at the beginning when the match is in another field", () => {
    expect(joined(excerpt("Court texte.", ["absent"]))).toBe("Court texte.");
  });

  it("read the text without its markup", () => {
    expect(plainText("Un **grand** [lien](https://exemple.fr) ici.\n\nSecond paragraphe")).toBe(
      "Un grand lien ici. Second paragraphe",
    );
  });
});

describe("searchEntries", () => {
  let db: Db;
  let cast: ReturnType<typeof insertCast>;
  let trip: Trip;

  function entry(intent: "save" | "publish", overrides = {}, author: Actor = cast.publisher, inTrip = trip): Entry {
    const result = createEntry(db, author, inTrip.id, entryInput({ peopleIds: [cast.guest.id], ...overrides }), intent);
    if (!result.ok) throw new Error(result.reason);
    return result.entry;
  }
  const titles = (actor: Actor, query: string) =>
    searchEntries(db, actor, query).results.map((result) => joined(result.title));

  beforeEach(() => {
    db = createTestDb();
    cast = insertCast(db);
    trip = makeTrip(db, cast.superuser, { title: "Martinique" });
  });

  it("finds words in the title, text, places, tags, trip, author and people", () => {
    entry("publish", { title: "Plage des Salines", body: "Une eau **turquoise**.", date: "2026-11-11" });
    entry("publish", { title: "Montagne Pelée", body: "Brouillard au sommet.", pointA: { lat: 14.8, lng: -61.17, name: "Prêcheur" }, newTags: ["Volcan"], date: "2026-11-14" });

    expect(titles(cast.guest, "turquoise")).toEqual(["Plage des Salines"]);
    expect(titles(cast.guest, "precheur")).toEqual(["Montagne Pelée"]);
    expect(titles(cast.guest, "VOLCAN")).toEqual(["Montagne Pelée"]);
    expect(titles(cast.guest, "martinique")).toEqual(["Montagne Pelée", "Plage des Salines"]);
    expect(titles(cast.guest, cast.publisher.displayName)).toHaveLength(2);
    expect(titles(cast.guest, cast.guest.displayName)).toHaveLength(2);
    expect(titles(cast.guest, "plage brouillard")).toEqual([]);
  });

  it("returns highlighted titles and passages", () => {
    entry("publish", { title: "Forêt tropicale", body: "Nous avons marché dans la forêt humide." });
    const [result] = searchEntries(db, cast.guest, "foret").results;
    expect(marked(result!.title)).toEqual(["Forêt"]);
    expect(marked(result!.excerpt)).toEqual(["forêt"]);
    expect(result).toMatchObject({ tripSlug: trip.slug, tripTitle: "Martinique", status: "published" });
  });

  it("follows the same visibility rules as the trip pages", () => {
    entry("save", { title: "Brouillon secret" });
    const hidden = makeTrip(db, cast.superuser, { title: "Surprise", isVisible: false });
    entry("publish", { title: "Secret caché" }, cast.superuser, hidden);

    expect(titles(cast.guest, "secret")).toEqual([]);
    expect(titles(cast.otherPublisher, "secret")).toEqual([]);
    expect(titles(null, "secret")).toEqual([]);
    // Its author finds their own draft; the superuser finds everything.
    expect(titles(cast.publisher, "secret")).toEqual(["Brouillon secret"]);
    expect(titles(cast.superuser, "secret").sort()).toEqual(["Brouillon secret", "Secret caché"]);
  });

  it("shows the most recent first and caps the number of results", () => {
    for (let day = 1; day <= MAX_SEARCH_RESULTS + 5; day++) {
      const date = new Date(Date.UTC(2026, 10, 1) + day * 86_400_000).toISOString().slice(0, 10);
      entry("save", { title: `Jour ${day}`, date }, cast.superuser);
    }
    const outcome = searchEntries(db, cast.superuser, "jour");
    expect(outcome.total).toBe(MAX_SEARCH_RESULTS + 5);
    expect(outcome.results).toHaveLength(MAX_SEARCH_RESULTS);
    expect(joined(outcome.results[0]!.title)).toBe(`Jour ${MAX_SEARCH_RESULTS + 5}`);
  });

  it("searches nothing for an empty query", () => {
    entry("publish");
    expect(searchEntries(db, cast.guest, "   ")).toEqual({ terms: [], total: 0, results: [] });
  });
});
