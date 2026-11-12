import type { Env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import type { MediaKind } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { checkUploadAllowed, recordMedia, type MediaItem, type UploadRefusal } from "@/server/services/media";
import { processPhoto, storeVideo, UnsupportedMediaError } from "./processing";
import {
  appendToUpload,
  cleanupStaleUploads,
  createUploadSession,
  entryDir,
  newPublicId,
  readUploadSession,
  relativeMediaPath,
  removeFiles,
  removeUploadSession,
  uploadPartPath,
  type UploadSession,
} from "./storage";

// Uploads arrive in chunks: a large video is never held in memory, and a
// network failure only costs the chunk in flight, which the client resends.

/** Largest chunk accepted in one request (the client sends smaller ones). */
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export type UploadConfig = Pick<Env, "mediaDir" | "maxPhotoBytes" | "maxVideoBytes" | "mediaQuotaBytes">;

export type UploadResult =
  /** The whole file has arrived and is stored. */
  | { ok: true; status: "complete"; media: MediaItem }
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
  const session = await createUploadSession(config.mediaDir, { entryId, userId: actor.id, ...upload });
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
  const allowed = checkUploadAllowed(db, actor, session.entryId, session, config);
  if (!allowed.ok) return abandon(allowed.reason);
  if (session.received + chunk.byteLength > session.size) return abandon("too_large");

  const received = await appendToUpload(config.mediaDir, session.uploadId, chunk);
  if (received < session.size) return { ok: true, status: "partial", uploadId: session.uploadId, received };

  // Last chunk: turn the temporary file into a stored media.
  const publicId = newPublicId();
  const destDir = entryDir(config.mediaDir, session.entryId);
  const source = uploadPartPath(config.mediaDir, session.uploadId);
  try {
    if (session.kind === "photo") {
      const photo = await processPhoto(source, destDir, publicId);
      const media = recordMedia(db, session.entryId, actor.id, {
        publicId,
        kind: "photo",
        filePath: relativeMediaPath(session.entryId, photo.fileName),
        thumbPath: relativeMediaPath(session.entryId, photo.thumbName),
        mimeType: "image/jpeg",
        sizeBytes: photo.sizeBytes,
        width: photo.width,
        height: photo.height,
        exifLat: photo.exif.lat,
        exifLng: photo.exif.lng,
        exifTakenAt: photo.exif.takenAt,
      });
      return { ok: true, status: "complete", media };
    }
    const video = await storeVideo(source, destDir, publicId);
    const media = recordMedia(db, session.entryId, actor.id, {
      publicId,
      kind: "video",
      filePath: relativeMediaPath(session.entryId, video.fileName),
      thumbPath: null,
      mimeType: video.mimeType,
      sizeBytes: video.sizeBytes,
      width: null,
      height: null,
      exifLat: null,
      exifLng: null,
      exifTakenAt: null,
    });
    return { ok: true, status: "complete", media };
  } catch (error) {
    if (error instanceof UnsupportedMediaError) return { ok: false, reason: error.reason };
    // The file could not be recorded: leave nothing behind.
    await removeFiles(config.mediaDir, [
      relativeMediaPath(session.entryId, `${publicId}.jpg`),
      relativeMediaPath(session.entryId, `${publicId}_thumb.jpg`),
      relativeMediaPath(session.entryId, `${publicId}.mp4`),
      relativeMediaPath(session.entryId, `${publicId}.webm`),
    ]);
    throw error;
  } finally {
    await removeUploadSession(config.mediaDir, session.uploadId);
  }
}
