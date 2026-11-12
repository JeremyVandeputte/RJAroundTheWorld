import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MediaKind } from "@/server/db/schema";

// Files on disk. Layout inside MEDIA_DIR:
//   <entryId>/<publicId>.jpg         resized photo
//   <entryId>/<publicId>_thumb.jpg   thumbnail
//   <entryId>/<publicId>.mp4|.webm   video, stored as received
//   .tmp/<uploadId>.part + .json     upload in progress

export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const UPLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

/** Uploads abandoned for longer than this are removed. */
export const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export function newPublicId(): string {
  return randomBytes(16).toString("base64url").slice(0, 22);
}

function tmpDir(mediaDir: string): string {
  return path.join(mediaDir, ".tmp");
}

/** Folder holding every file of an entry: deleting the entry deletes the folder. */
export function entryDir(mediaDir: string, entryId: number): string {
  return path.join(mediaDir, String(entryId));
}

/** Path stored in the database: relative to MEDIA_DIR, with forward slashes. */
export function relativeMediaPath(entryId: number, fileName: string): string {
  return `${entryId}/${fileName}`;
}

/**
 * Absolute path of a stored file. Refuses anything that would resolve
 * outside MEDIA_DIR, whatever the database contains.
 */
export function resolveMediaPath(mediaDir: string, relativePath: string): string | null {
  const root = path.resolve(mediaDir);
  const resolved = path.resolve(root, relativePath);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

export async function removeFiles(mediaDir: string, relativePaths: (string | null)[]): Promise<void> {
  for (const relativePath of relativePaths) {
    const absolute = relativePath ? resolveMediaPath(mediaDir, relativePath) : null;
    if (absolute) await fs.rm(absolute, { force: true });
  }
}

/** Removes every media file of the given entries (after they were deleted). */
export async function removeEntryDirs(mediaDir: string, entryIds: number[]): Promise<void> {
  for (const entryId of entryIds) {
    await fs.rm(entryDir(mediaDir, entryId), { recursive: true, force: true });
  }
}

// --- Uploads in progress --------------------------------------------------

export type UploadSession = {
  uploadId: string;
  entryId: number;
  userId: number;
  kind: MediaKind;
  /** Total size announced by the client, in bytes. */
  size: number;
  /** Bytes received so far. */
  received: number;
};

function partPath(mediaDir: string, uploadId: string): string {
  return path.join(tmpDir(mediaDir), `${uploadId}.part`);
}

function metaPath(mediaDir: string, uploadId: string): string {
  return path.join(tmpDir(mediaDir), `${uploadId}.json`);
}

export function uploadPartPath(mediaDir: string, uploadId: string): string {
  return partPath(mediaDir, uploadId);
}

export async function createUploadSession(
  mediaDir: string,
  details: Pick<UploadSession, "entryId" | "userId" | "kind" | "size">,
): Promise<UploadSession> {
  const uploadId = randomBytes(24).toString("base64url");
  await fs.mkdir(tmpDir(mediaDir), { recursive: true });
  await fs.writeFile(metaPath(mediaDir, uploadId), JSON.stringify(details));
  await fs.writeFile(partPath(mediaDir, uploadId), "");
  return { uploadId, ...details, received: 0 };
}

export async function readUploadSession(mediaDir: string, uploadId: string): Promise<UploadSession | null> {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) return null;
  try {
    const details = JSON.parse(await fs.readFile(metaPath(mediaDir, uploadId), "utf8")) as Omit<
      UploadSession,
      "uploadId" | "received"
    >;
    const { size: received } = await fs.stat(partPath(mediaDir, uploadId));
    return { uploadId, ...details, received };
  } catch {
    return null;
  }
}

/** Appends a chunk and returns the number of bytes received so far. */
export async function appendToUpload(mediaDir: string, uploadId: string, chunk: Uint8Array): Promise<number> {
  await fs.appendFile(partPath(mediaDir, uploadId), chunk);
  return (await fs.stat(partPath(mediaDir, uploadId))).size;
}

export async function removeUploadSession(mediaDir: string, uploadId: string): Promise<void> {
  await fs.rm(partPath(mediaDir, uploadId), { force: true });
  await fs.rm(metaPath(mediaDir, uploadId), { force: true });
}

/** Deletes temporary files of uploads that were never completed. */
export async function cleanupStaleUploads(mediaDir: string, now = Date.now()): Promise<void> {
  let names: string[];
  try {
    names = await fs.readdir(tmpDir(mediaDir));
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(tmpDir(mediaDir), name);
    try {
      if (now - (await fs.stat(file)).mtimeMs > STALE_UPLOAD_MS) await fs.rm(file, { force: true });
    } catch {
      // Already gone: nothing to clean.
    }
  }
}
