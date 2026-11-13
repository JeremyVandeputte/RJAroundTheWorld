import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  draftKey,
  EMPTY_ENTRY_VALUES,
  loadDraft,
  sameValues,
  saveDraft,
  type EntryFormValues,
} from "@/lib/entry-draft";

const values: EntryFormValues = {
  date: "2026-07-14",
  title: "Plage de Nazaré",
  body: "Des vagues énormes.\n\nPuis un café.",
  peopleIds: [3, 1],
  tagIds: [2, 5],
  newTags: ["Surf", "Océan"],
  pointA: { lat: 39.6, lng: -9.07, name: "Nazaré" },
  pointB: null,
};

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

describe("draftKey", () => {
  it("separates accounts, trips and entries", () => {
    expect(draftKey(1, 2, null)).toBe("rj:entry-draft:1:2:new");
    expect(draftKey(1, 2, 7)).toBe("rj:entry-draft:1:2:7");
    expect(draftKey(4, 2, 7)).not.toBe(draftKey(1, 2, 7));
  });
});

describe("sameValues", () => {
  it("ignores order and surrounding spaces", () => {
    const reordered: EntryFormValues = {
      ...values,
      title: `  ${values.title} `,
      body: values.body.replace(/\n/g, "\r\n") + "\n",
      peopleIds: [1, 3],
      tagIds: [5, 2],
      newTags: ["Océan", "Surf"],
      pointA: { lat: 39.6, lng: -9.07, name: "Nazaré " },
    };
    expect(sameValues(values, reordered)).toBe(true);
  });

  it("sees real changes", () => {
    expect(sameValues(values, { ...values, title: "Autre" })).toBe(false);
    expect(sameValues(values, { ...values, tagIds: [2] })).toBe(false);
    expect(sameValues(values, { ...values, pointB: { lat: 39.7, lng: -9, name: "" } })).toBe(false);
    expect(sameValues(values, EMPTY_ENTRY_VALUES)).toBe(false);
  });
});

describe("local storage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves, reads back and clears a draft", () => {
    const key = draftKey(1, 2, null);
    expect(loadDraft(key)).toBeNull();
    saveDraft(key, values, 1_700_000_000_000);
    expect(loadDraft(key)).toEqual({ values, savedAt: 1_700_000_000_000 });
    clearDraft(key);
    expect(loadDraft(key)).toBeNull();
  });

  it("ignores unreadable content", () => {
    window.localStorage.setItem("broken", "{not json");
    window.localStorage.setItem("partial", JSON.stringify({ values }));
    expect(loadDraft("broken")).toBeNull();
    expect(loadDraft("partial")).toBeNull();
  });

  it("keeps working when storage is unavailable", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
    });
    expect(() => saveDraft("key", values)).not.toThrow();
    expect(loadDraft("key")).toBeNull();
    expect(() => clearDraft("key")).not.toThrow();
  });
});
