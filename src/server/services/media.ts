import { and, asc, count, eq, inArray, max, sum } from "drizzle-orm";
import type { Env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import { entries, media, trips, type MediaKind } from "@/server/db/schema";
import { canEditEntry, canViewEntry, type Actor } from "@/server/permissions";
import type { Entry } from "./entries";
import type { Trip } from "./trips";

// Database side of photos and videos. Files themselves are handled in
// `src/server/media/`; every function here applies the permission matrix.

export type MediaRow = typeof media.$inferSelect;
export type MediaLimits = Pick<Env, "maxPhotoBytes" | "maxVideoBytes" | "mediaQuotaBytes">;

/** What pages need to display a photo or a video. */
export type MediaItem = Pick<MediaRow, "publicId" | "kind" | "width" | "height">;

export const MAX_MEDIA_PER_ENTRY = 100;

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

/** First photo of each entry, used as a cover in lists. Only for entries the caller already listed. */
export function listCoverPhotos(db: Db, entryIds: number[]): Map<number, MediaItem> {
  const covers = new Map<number, MediaItem>();
  if (entryIds.length === 0) return covers;
  const rows = db
    .select()
    .from(media)
    .where(and(inArray(media.entryId, entryIds), eq(media.kind, "photo")))
    .orderBy(asc(media.position), asc(media.id))
    .all();
  for (const row of rows) {
    if (!covers.has(row.entryId)) covers.set(row.entryId, toItem(row));
  }
  return covers;
}

function findWithContext(db: Db, publicId: string) {
  return db
    .select({ media, entry: entries, trip: trips })
    .from(media)
    .innerJoin(entries, eq(entries.id, media.entryId))
    .innerJoin(trips, eq(trips.id, entries.tripId))
    .where(eq(media.publicId, publicId))
    .get();
}

/**
 * A media file follows the visibility of its entry: hidden trip, draft or
 * unknown file all give the same answer (null), so nothing can be guessed.
 */
export function getMediaForViewing(db: Db, actor: Actor, publicId: string): MediaRow | null {
  const found = findWithContext(db, publicId);
  return found && canViewEntry(actor, found.trip, found.entry) ? found.media : null;
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

export type NewMedia = Pick<
  typeof media.$inferInsert,
  "publicId" | "kind" | "filePath" | "thumbPath" | "mimeType" | "sizeBytes" | "width" | "height" | "exifLat" | "exifLng" | "exifTakenAt"
>;

/** Records a stored file. Only the path and metadata go to the database. */
export function recordMedia(db: Db, entryId: number, uploaderId: number, file: NewMedia): MediaItem {
  const last = db.select({ position: max(media.position) }).from(media).where(eq(media.entryId, entryId)).get();
  const row = db
    .insert(media)
    .values({ ...file, entryId, uploaderId, position: (last?.position ?? -1) + 1 })
    .returning()
    .get();
  return toItem(row);
}

/**
 * Removes a media from an entry. Returns the files to delete from disk
 * (paths relative to MEDIA_DIR).
 */
export function deleteMedia(
  db: Db,
  actor: Actor,
  publicId: string,
): { ok: true; files: (string | null)[] } | { ok: false; reason: "not_found" | "forbidden" } {
  const found = findWithContext(db, publicId);
  if (!found || !canViewEntry(actor, found.trip, found.entry)) return { ok: false, reason: "not_found" };
  if (!canEditEntry(actor, found.trip, found.entry)) return { ok: false, reason: "forbidden" };
  db.delete(media).where(eq(media.id, found.media.id)).run();
  return { ok: true, files: [found.media.filePath, found.media.thumbPath] };
}
