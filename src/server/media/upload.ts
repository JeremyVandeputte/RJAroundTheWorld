import type { Env } from "@/lib/env";
import type { PhotoPosition } from "@/lib/photo-position";
import type { Db } from "@/server/db/client";
import { eq } from "drizzle-orm";
import { media as mediaTable, type MediaKind } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import {
  checkTripCoverUploadAllowed,
  checkUploadAllowed,
  photoPosition,
  recordMedia,
  recordTripCover,
  type MediaItem,
  type UploadRefusal,
} from "@/server/services/media";
import { processPhoto, storeVideo, UnsupportedMediaError } from "./processing";
import { scheduleTranscode } from "./transcode";
import {
  appendToUpload,
  cleanupStaleUploads,
  createUploadSession,
  entryDir,
  newPublicId,
  readUploadSession,
  relativeMediaPath,
  removeFiles,
  tripDir,
  tripFolder,
  removeUploadSession,
  uploadPartPath,
  type UploadSession,
} from "./storage";

// Uploads arrive in chunks: a large video is never held in memory, and a
// network failure only costs the chunk in flight, which the client resends.

/** Largest chunk accepted in one request (the client sends smaller ones). */
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export type UploadConfig = Pick<Env, "mediaDir" | "maxPhotoBytes" | "maxVideoBytes" | "mediaQuotaBytes"> &
  Partial<Pick<Env, "ffmpegPath">>;

export type UploadResult =
  /** The whole file has arrived and is stored. */
  | {
      ok: true;
      status: "complete";
      media: MediaItem;
      /** GPS position of an entry photo, for its author to place the entry. */
      position?: PhotoPosition | null;
    }
  /** More chunks are expected; `received` is the offset of the next one. */
  | { ok: true; status: "partial"; uploadId: string; received: number }
  | {
      ok: false;
      reason:
        | UploadRefusal
        | "invalid_request"
        | "chunk_too_large"
        | "upload_not_found"
        | "unsupported_image"
        | "unsupported_video";
    }
  /** The chunk does not start where the server stopped: resend from `received`. */
  | { ok: false; reason: "offset_mismatch"; received: number };

const uploadLocks = new Map<string, Promise<unknown>>();

/** Runs tasks of the same upload one after the other. */
async function withUploadLock<T>(uploadId: string, task: () => Promise<T>): Promise<T> {
  const previous = uploadLocks.get(uploadId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  uploadLocks.set(uploadId, run);
  try {
    return await run;
  } finally {
    if (uploadLocks.get(uploadId) === run) uploadLocks.delete(uploadId);
  }
}

function isValidSize(size: number): boolean {
  return Number.isSafeInteger(size) && size > 0;
}

/** Starts an upload with its first chunk (which may be the whole file). */
export async function startUpload(
  db: Db,
  config: UploadConfig,
  actor: Actor,
  entryId: number,
  upload: { kind: MediaKind; size: number },
  chunk: Uint8Array,
): Promise<UploadResult> {
  if (!isValidSize(upload.size) || chunk.byteLength === 0) return { ok: false, reason: "invalid_request" };
  if (chunk.byteLength > MAX_CHUNK_BYTES) return { ok: false, reason: "chunk_too_large" };

  const allowed = checkUploadAllowed(db, actor, entryId, upload, config);
  if (!allowed.ok) return allowed;
  if (!actor) return { ok: false, reason: "forbidden" };
  if (chunk.byteLength > upload.size) return { ok: false, reason: "too_large" };

  await cleanupStaleUploads(config.mediaDir);
  const session = await createUploadSession(config.mediaDir, { entryId, tripId: null, userId: actor.id, ...upload });
  return receiveChunk(db, config, actor, session, chunk);
}

/** Starts the upload of a photo that becomes a trip's thumbnail. */
export async function startTripCoverUpload(
  db: Db,
  config: UploadConfig,
  actor: Actor,
  tripId: number,
  size: number,
  chunk: Uint8Array,
): Promise<UploadResult> {
  if (!isValidSize(size) || chunk.byteLength === 0) return { ok: false, reason: "invalid_request" };
  if (chunk.byteLength > MAX_CHUNK_BYTES) return { ok: false, reason: "chunk_too_large" };

  const allowed = checkTripCoverUploadAllowed(db, actor, tripId, size, config);
  if (!allowed.ok) return allowed;
  if (!actor) return { ok: false, reason: "forbidden" };
  if (chunk.byteLength > size) return { ok: false, reason: "too_large" };

  await cleanupStaleUploads(config.mediaDir);
  const session = await createUploadSession(config.mediaDir, { entryId: null, tripId, userId: actor.id, kind: "photo", size });
  return receiveChunk(db, config, actor, session, chunk);
}

/** Adds the next chunk to an upload in progress. */
export async function continueUpload(
  db: Db,
  config: UploadConfig,
  actor: Actor,
  uploadId: string,
  offset: number,
  chunk: Uint8Array,
): Promise<UploadResult> {
  if (chunk.byteLength === 0 || !Number.isSafeInteger(offset) || offset < 0) return { ok: false, reason: "invalid_request" };
  if (chunk.byteLength > MAX_CHUNK_BYTES) return { ok: false, reason: "chunk_too_large" };

  return withUploadLock(uploadId, async () => {
    const session = await readUploadSession(config.mediaDir, uploadId);
    // An upload belongs to the account that started it; others get the same answer as for an unknown one.
    if (!session || !actor || session.userId !== actor.id) return { ok: false, reason: "upload_not_found" };
    if (offset !== session.received) return { ok: false, reason: "offset_mismatch", received: session.received };
    return receiveChunk(db, config, actor, session, chunk);
  });
}

async function receiveChunk(
  db: Db,
  config: UploadConfig,
  actor: NonNullable<Actor>,
  session: UploadSession,
  chunk: Uint8Array,
): Promise<UploadResult> {
  const abandon = async <Reason extends string>(reason: Reason) => {
    await removeUploadSession(config.mediaDir, session.uploadId);
    return { ok: false as const, reason };
  };

  // Permissions may have changed since the upload started.
  const tripId = session.tripId ?? null;
  const entryId = session.entryId;
  const allowed =
    tripId !== null
      ? checkTripCoverUploadAllowed(db, actor, tripId, session.size, config)
      : entryId !== null
        ? checkUploadAllowed(db, actor, entryId, session, config)
        : ({ ok: false, reason: "not_found" } as const);
  if (!allowed.ok) return abandon(allowed.reason);
  if (session.received + chunk.byteLength > session.size) return abandon("too_large");

  const received = await appendToUpload(config.mediaDir, session.uploadId, chunk);
  if (received < session.size) return { ok: true, status: "partial", uploadId: session.uploadId, received };

  // Last chunk: turn the temporary file into a stored media.
  const publicId = newPublicId();
  const folder = tripId !== null ? tripFolder(tripId) : String(entryId);
  const destDir = tripId !== null ? tripDir(config.mediaDir, tripId) : entryDir(config.mediaDir, entryId!);
  const source = uploadPartPath(config.mediaDir, session.uploadId);
  try {
    if (tripId !== null) {
      const photo = await processPhoto(source, destDir, publicId);
      const { media, replacedFiles } = recordTripCover(db, tripId, actor.id, {
        publicId,
        kind: "photo",
        filePath: relativeMediaPath(folder, photo.fileName),
        thumbPath: relativeMediaPath(folder, photo.thumbName),
        mimeType: "image/jpeg",
        sizeBytes: photo.sizeBytes,
        width: photo.width,
        height: photo.height,
        exifLat: photo.exif.lat,
        exifLng: photo.exif.lng,
        exifTakenAt: photo.exif.takenAt,
      });
      await removeFiles(config.mediaDir, replacedFiles);
      return { ok: true, status: "complete", media };
    }
    if (session.kind === "photo") {
      const photo = await processPhoto(source, destDir, publicId);
      const media = recordMedia(db, entryId!, actor.id, {
        publicId,
        kind: "photo",
        filePath: relativeMediaPath(folder, photo.fileName),
        thumbPath: relativeMediaPath(folder, photo.thumbName),
        mimeType: "image/jpeg",
        sizeBytes: photo.sizeBytes,
        width: photo.width,
        height: photo.height,
        exifLat: photo.exif.lat,
        exifLng: photo.exif.lng,
        exifTakenAt: photo.exif.takenAt,
      });
      const position = photoPosition({
        publicId,
        exifLat: photo.exif.lat,
        exifLng: photo.exif.lng,
        exifTakenAt: photo.exif.takenAt,
      });
      return { ok: true, status: "complete", media, position };
    }
    const video = await storeVideo(source, destDir, publicId);
    const media = recordMedia(db, entryId!, actor.id, {
      publicId,
      kind: "video",
      filePath: relativeMediaPath(folder, video.fileName),
      thumbPath: null,
      mimeType: video.mimeType,
      sizeBytes: video.sizeBytes,
      width: null,
      height: null,
      exifLat: null,
      exifLng: null,
      exifTakenAt: null,
      // With ffmpeg configured, the video is converted after this answer.
      processing: config.ffmpegPath ? "pending" : null,
    });
    if (config.ffmpegPath) {
      const recorded = db.select({ id: mediaTable.id }).from(mediaTable).where(eq(mediaTable.publicId, publicId)).get();
      if (recorded) void scheduleTranscode(db, { mediaDir: config.mediaDir, ffmpegPath: config.ffmpegPath }, recorded.id);
    }
    return { ok: true, status: "complete", media };
  } catch (error) {
    if (error instanceof UnsupportedMediaError) return { ok: false, reason: error.reason };
    // The file could not be recorded: leave nothing behind.
    await removeFiles(config.mediaDir, [
      relativeMediaPath(folder, `${publicId}.jpg`),
      relativeMediaPath(folder, `${publicId}_thumb.jpg`),
      relativeMediaPath(folder, `${publicId}.mp4`),
      relativeMediaPath(folder, `${publicId}.webm`),
    ]);
    throw error;
  } finally {
    await removeUploadSession(config.mediaDir, session.uploadId);
  }
}
