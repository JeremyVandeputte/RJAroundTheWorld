// Local copy of an entry being written, kept in the browser of the device so
// that nothing typed is lost if the connection drops or the page is closed.
// It never leaves the device and is removed once the entry is saved.

export type DraftPoint = { lat: number; lng: number; name: string };

export type EntryFormValues = {
  date: string;
  title: string;
  body: string;
  peopleIds: number[];
  tagIds: number[];
  newTags: string[];
  pointA: DraftPoint | null;
  pointB: DraftPoint | null;
};

export type StoredDraft = { values: EntryFormValues; savedAt: number };

export const EMPTY_ENTRY_VALUES: EntryFormValues = {
  date: "",
  title: "",
  body: "",
  peopleIds: [],
  tagIds: [],
  newTags: [],
  pointA: null,
  pointB: null,
};

const PREFIX = "rj:entry-draft";

/** One key per account, trip and entry ("new" for an entry not saved yet). */
export function draftKey(userId: number, tripId: number, entryId: number | null): string {
  return `${PREFIX}:${userId}:${tripId}:${entryId ?? "new"}`;
}

function readPoint(data: FormData, prefix: "pointA" | "pointB"): DraftPoint | null {
  const lat = Number(data.get(`${prefix}Lat`));
  const lng = Number(data.get(`${prefix}Lng`));
  if (!data.get(`${prefix}Lat`) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const name = data.get(`${prefix}Name`);
  return { lat, lng, name: typeof name === "string" ? name : "" };
}

const strings = (data: FormData, name: string) =>
  data.getAll(name).filter((value): value is string => typeof value === "string");
const numbers = (data: FormData, name: string) =>
  strings(data, name)
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0);

/** Current values of the entry form. */
export function readFormValues(form: HTMLFormElement): EntryFormValues {
  const data = new FormData(form);
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    date: text("date"),
    title: text("title"),
    body: text("body"),
    peopleIds: numbers(data, "people"),
    tagIds: numbers(data, "tags"),
    newTags: strings(data, "newTags"),
    pointA: readPoint(data, "pointA"),
    pointB: readPoint(data, "pointB"),
  };
}

function normalize(values: EntryFormValues): string {
  const point = (p: DraftPoint | null) => (p ? { lat: p.lat, lng: p.lng, name: p.name.trim() } : null);
  return JSON.stringify({
    date: values.date,
    title: values.title.trim(),
    body: values.body.replace(/\r\n?/g, "\n").trim(),
    peopleIds: [...values.peopleIds].sort((a, b) => a - b),
    tagIds: [...values.tagIds].sort((a, b) => a - b),
    newTags: [...values.newTags].sort(),
    pointA: point(values.pointA),
    pointB: point(values.pointB),
  });
}

/** Same content, ignoring order and surrounding spaces. */
export function sameValues(a: EntryFormValues, b: EntryFormValues): boolean {
  return normalize(a) === normalize(b);
}

// Browser storage can be unavailable (private browsing, full, disabled):
// every access is guarded, and failing only means no local copy.

export function loadDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    return parsed && typeof parsed.savedAt === "number" && parsed.values ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, values: EntryFormValues, now = Date.now()): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ values, savedAt: now } satisfies StoredDraft));
  } catch {
    // No local copy possible: the form still works.
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
