import { and, asc, count, desc, eq, inArray, isNotNull, max, ne, sum } from "drizzle-orm";
import type { Env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import { entries, media, trips, type MediaKind } from "@/server/db/schema";
import { canEditEntry, canEditTrip, canViewEntry, canViewTrip, type Actor } from "@/server/permissions";
import type { Entry } from "./entries";
import type { Trip } from "./trips";

// Database side of photos and videos. Files themselves are handled in
// `src/server/media/`; every function here applies the permission matrix.
//
// A file belongs either to an entry (its photos and videos) or to a trip
// (a photo uploaded as the trip's thumbnail). A trip's thumbnail can also be
// one of its entries' photos; an entry's thumbnail is one of its own photos.

export type MediaRow = typeof media.$inferSelect;
export type MediaLimits = Pick<Env, "maxPhotoBytes" | "maxVideoBytes" | "mediaQuotaBytes">;

/** What pages need to display a photo or a video. */
export type MediaItem = Pick<MediaRow, "publicId" | "kind" | "width" | "height">;

export const MAX_MEDIA_PER_ENTRY = 100;
/** Photos offered when choosing a trip's thumbnail among its entries' photos. */
export const MAX_COVER_CANDIDATES = 60;

function toItem(row: MediaRow): MediaItem {
  return { publicId: row.publicId, kind: row.kind, width: row.width, height: row.height };
}

/** Total size of all stored media, counted against the quota. */
export function getMediaUsage(db: Db): number {
  return Number(db.select({ total: sum(media.sizeBytes) }).from(media).get()?.total ?? 0);
}

/** Media of an entry, in upload order. Empty when the actor cannot see the entry. */
export function listEntryMedia(db: Db, actor: Actor, trip: Trip, entry: Entry): MediaItem[] {
  if (entry.tripId !== trip.id || !canViewEntry(actor, trip, entry)) return [];
  return db
    .select()
    .from(media)
    .where(eq(media.entryId, entry.id))
    .orderBy(asc(media.position), asc(media.id))
    .all()
    .map(toItem);
}

/**
 * Thumbnail of each entry: the photo its author chose, or else its first
 * photo. Only for entries the caller already listed for this viewer.
 */
export function listCoverPhotos(db: Db, entryIds: number[]): Map<number, MediaItem> {
  const covers = new Map<number, MediaItem>();
  if (entryIds.length === 0) return covers;
  const chosen = new Map(
    db
      .select({ id: entries.id, coverMediaId: entries.coverMediaId })
      .from(entries)
      .where(inArray(entries.id, entryIds))
      .all()
      .map((row) => [row.id, row.coverMediaId]),
  );
  const rows = db
    .select()
    .from(media)
    .where(and(inArray(media.entryId, entryIds), eq(media.kind, "photo")))
    .orderBy(asc(media.position), asc(media.id))
    .all();
  for (const row of rows) {
    if (row.entryId === null) continue;
    const isChosen = chosen.get(row.entryId) === row.id;
    // The chosen photo wins; otherwise the first photo stays.
    if (isChosen || !covers.has(row.entryId)) covers.set(row.entryId, toItem(row));
  }
  return covers;
}

/** Public id of the photo chosen as an entry's thumbnail, if any. */
export function getEntryCoverId(db: Db, entry: Entry): string | null {
  if (entry.coverMediaId === null) return null;
  return db.select({ publicId: media.publicId }).from(media).where(eq(media.id, entry.coverMediaId)).get()?.publicId ?? null;
}

/** Thumbnail of each trip (callers only pass trips the viewer can see). */
export function listTripCovers(db: Db, tripList: Trip[]): Map<number, MediaItem> {
  const covers = new Map<number, MediaItem>();
  const ids = tripList.map((trip) => trip.coverMediaId).filter((id): id is number => id !== null);
  if (ids.length === 0) return covers;
  const rows = new Map(db.select().from(media).where(inArray(media.id, ids)).all().map((row) => [row.id, row]));
  for (const trip of tripList) {
    const row = trip.coverMediaId === null ? undefined : rows.get(trip.coverMediaId);
    if (row) covers.set(trip.id, toItem(row));
  }
  return covers;
}

type MediaContext = { media: MediaRow; entry: Entry | null; trip: Trip };

function findWithContext(db: Db, publicId: string): MediaContext | null {
  const row = db.select().from(media).where(eq(media.publicId, publicId)).get();
  if (!row) return null;
  if (row.entryId !== null) {
    const found = db
      .select({ entry: entries, trip: trips })
      .from(entries)
      .innerJoin(trips, eq(trips.id, entries.tripId))
      .where(eq(entries.id, row.entryId))
      .get();
    return found ? { media: row, ...found } : null;
  }
  const trip = row.tripId === null ? undefined : db.select().from(trips).where(eq(trips.id, row.tripId)).get();
  return trip ? { media: row, entry: null, trip } : null;
}

/**
 * A media file follows the visibility of what it belongs to: its entry, or
 * its trip for a trip's own thumbnail. A photo chosen as a trip's thumbnail
 * is also shown wherever that trip is. Otherwise (hidden trip, draft, unknown
 * file) the answer is the same null, so nothing can be guessed.
 */
export function getMediaForViewing(db: Db, actor: Actor, publicId: string): MediaRow | null {
  const found = findWithContext(db, publicId);
  if (!found) return null;
  if (found.entry ? canViewEntry(actor, found.trip, found.entry) : canViewTrip(actor, found.trip)) return found.media;
  const coverOf = db.select().from(trips).where(eq(trips.coverMediaId, found.media.id)).all();
  return coverOf.some((trip) => canViewTrip(actor, trip)) ? found.media : null;
}

export type UploadRefusal = "not_found" | "forbidden" | "too_large" | "quota_exceeded" | "too_many";

/**
 * Checks that the actor may add a file of this kind and size to an entry.
 * Called before accepting any data, and again before the file is recorded.
 */
export function checkUploadAllowed(
  db: Db,
  actor: Actor,
  entryId: number,
  upload: { kind: MediaKind; size: number },
  limits: MediaLimits,
): { ok: true; entry: Entry } | { ok: false; reason: UploadRefusal } {
  const found = db
    .select({ entry: entries, trip: trips })
    .from(entries)
    .innerJoin(trips, eq(trips.id, entries.tripId))
    .where(eq(entries.id, entryId))
    .get();
  if (!found || !canViewEntry(actor, found.trip, found.entry)) return { ok: false, reason: "not_found" };
  if (!canEditEntry(actor, found.trip, found.entry)) return { ok: false, reason: "forbidden" };

  const maxBytes = upload.kind === "photo" ? limits.maxPhotoBytes : limits.maxVideoBytes;
  if (upload.size > maxBytes) return { ok: false, reason: "too_large" };

  const existing = db.select({ total: count() }).from(media).where(eq(media.entryId, entryId)).get()?.total ?? 0;
  if (existing >= MAX_MEDIA_PER_ENTRY) return { ok: false, reason: "too_many" };

  if (getMediaUsage(db) + upload.size > limits.mediaQuotaBytes) return { ok: false, reason: "quota_exceeded" };
  return { ok: true, entry: found.entry };
}

/** Same as `checkUploadAllowed`, for a photo uploaded as a trip's thumbnail. */
export function checkTripCoverUploadAllowed(
  db: Db,
  actor: Actor,
  tripId: number,
  size: number,
  limits: MediaLimits,
): { ok: true; trip: Trip } | { ok: false; reason: UploadRefusal } {
  const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
  if (!trip || !canViewTrip(actor, trip)) return { ok: false, reason: "not_found" };
  if (!canEditTrip(actor, trip)) return { ok: false, reason: "forbidden" };
  if (size > limits.maxPhotoBytes) return { ok: false, reason: "too_large" };
  if (getMediaUsage(db) + size > limits.mediaQuotaBytes) return { ok: false, reason: "quota_exceeded" };
  return { ok: true, trip };
}

export type NewMedia = Pick<
  typeof media.$inferInsert,
  "publicId" | "kind" | "filePath" | "thumbPath" | "mimeType" | "sizeBytes" | "width" | "height" | "exifLat" | "exifLng" | "exifTakenAt"
>;

/** Records a stored file of an entry. Only the path and metadata go to the database. */
export function recordMedia(db: Db, entryId: number, uploaderId: number, file: NewMedia): MediaItem {
  const last = db.select({ position: max(media.position) }).from(media).where(eq(media.entryId, entryId)).get();
  const row = db
    .insert(media)
    .values({ ...file, entryId, uploaderId, position: (last?.position ?? -1) + 1 })
    .returning()
    .get();
  return toItem(row);
}

/** Removes the trip's own thumbnail photos other than `keepId`; returns their files. */
function dropOwnCovers(db: Db, tripId: number, keepId: number | null): (string | null)[] {
  const condition =
    keepId === null ? eq(media.tripId, tripId) : and(eq(media.tripId, tripId), ne(media.id, keepId));
  const old = db.select().from(media).where(condition).all();
  if (old.length > 0) db.delete(media).where(condition).run();
  return old.flatMap((row) => [row.filePath, row.thumbPath]);
}

/**
 * Records a photo uploaded as a trip's thumbnail and makes it the thumbnail.
 * Returns the files of the thumbnail it replaces, to delete from disk.
 */
export function recordTripCover(
  db: Db,
  tripId: number,
  uploaderId: number,
  file: NewMedia,
): { media: MediaItem; replacedFiles: (string | null)[] } {
  return db.transaction((tx) => {
    const txDb = tx as unknown as Db;
    const row = tx.insert(media).values({ ...file, tripId, uploaderId }).returning().get();
    tx.update(trips).set({ coverMediaId: row.id }).where(eq(trips.id, tripId)).run();
    return { media: toItem(row), replacedFiles: dropOwnCovers(txDb, tripId, row.id) };
  });
}

type ChoiceResult = { ok: true; replacedFiles: (string | null)[] } | { ok: false; reason: "not_found" | "forbidden" | "not_a_photo" };

/** Photos of a trip's entries that the actor may pick as the trip's thumbnail, newest day first. */
export function listTripCoverCandidates(db: Db, actor: Actor, trip: Trip): MediaItem[] {
  if (!canEditTrip(actor, trip)) return [];
  return db
    .select({ media, entry: entries })
    .from(media)
    .innerJoin(entries, eq(entries.id, media.entryId))
    .where(and(eq(entries.tripId, trip.id), eq(media.kind, "photo"), isNotNull(media.entryId)))
    .orderBy(desc(entries.date), asc(media.position), asc(media.id))
    .all()
    .filter((row) => canViewEntry(actor, trip, row.entry))
    .slice(0, MAX_COVER_CANDIDATES)
    .map((row) => toItem(row.media));
}

/** Makes one of the trip's entries' photos its thumbnail. */
export function chooseTripCover(db: Db, actor: Actor, tripId: number, publicId: string): ChoiceResult {
  const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
  if (!trip || !canViewTrip(actor, trip)) return { ok: false, reason: "not_found" };
  if (!canEditTrip(actor, trip)) return { ok: false, reason: "forbidden" };
  const found = findWithContext(db, publicId);
  if (!found || !found.entry || found.trip.id !== tripId || !canViewEntry(actor, trip, found.entry)) {
    return { ok: false, reason: "not_found" };
  }
  if (found.media.kind !== "photo") return { ok: false, reason: "not_a_photo" };
  return db.transaction((tx) => {
    tx.update(trips).set({ coverMediaId: found.media.id }).where(eq(trips.id, tripId)).run();
    return { ok: true as const, replacedFiles: dropOwnCovers(tx as unknown as Db, tripId, null) };
  });
}

/** Chooses which of an entry's photos is its thumbnail. */
export function chooseEntryCover(db: Db, actor: Actor, publicId: string): ChoiceResult {
  const found = findWithContext(db, publicId);
  if (!found || !found.entry || !canViewEntry(actor, found.trip, found.entry)) return { ok: false, reason: "not_found" };
  if (!canEditEntry(actor, found.trip, found.entry)) return { ok: false, reason: "forbidden" };
  if (found.media.kind !== "photo") return { ok: false, reason: "not_a_photo" };
  db.update(entries).set({ coverMediaId: found.media.id }).where(eq(entries.id, found.entry.id)).run();
  return { ok: true, replacedFiles: [] };
}

/**
 * Removes a media from an entry. Returns the files to delete from disk
 * (paths relative to MEDIA_DIR). A trip's own thumbnail is not removed this
 * way: it is replaced by another one.
 */
export function deleteMedia(
  db: Db,
  actor: Actor,
  publicId: string,
): { ok: true; files: (string | null)[] } | { ok: false; reason: "not_found" | "forbidden" } {
  const found = findWithContext(db, publicId);
  if (!found || !found.entry || !canViewEntry(actor, found.trip, found.entry)) return { ok: false, reason: "not_found" };
  if (!canEditEntry(actor, found.trip, found.entry)) return { ok: false, reason: "forbidden" };
  db.delete(media).where(eq(media.id, found.media.id)).run();
  return { ok: true, files: [found.media.filePath, found.media.thumbPath] };
}
