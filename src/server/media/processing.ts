import fs from "node:fs/promises";
import path from "node:path";
import exifReader from "exif-reader";
import sharp from "sharp";

// Do not keep source files open: temporary uploads are deleted right after processing.
sharp.cache(false);

/** Longest side of a stored photo, in pixels. */
export const PHOTO_MAX_DIMENSION = 2000;
export const THUMBNAIL_MAX_DIMENSION = 480;

const ACCEPTED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export class UnsupportedMediaError extends Error {
  constructor(public readonly reason: "unsupported_image" | "unsupported_video") {
    super(reason);
    this.name = "UnsupportedMediaError";
  }
}

export type PhotoExif = { lat: number | null; lng: number | null; takenAt: string | null };

export type ProcessedPhoto = {
  fileName: string;
  thumbName: string;
  width: number;
  height: number;
  /** Size on disk of the photo and its thumbnail together. */
  sizeBytes: number;
  exif: PhotoExif;
};

function toDecimalDegrees(parts: unknown, ref: unknown): number | null {
  if (!Array.isArray(parts) || parts.length !== 3 || !parts.every((part) => typeof part === "number")) return null;
  const [degrees, minutes, seconds] = parts as [number, number, number];
  const value = degrees + minutes / 60 + seconds / 3600;
  if (!Number.isFinite(value)) return null;
  return ref === "S" || ref === "W" ? -value : value;
}

/**
 * GPS position and capture date of a photo, read before the metadata is
 * stripped. Kept in the database for Phase 2 (placing an entry from a photo).
 */
export function readExif(exifBuffer: Buffer | undefined): PhotoExif {
  const empty: PhotoExif = { lat: null, lng: null, takenAt: null };
  if (!exifBuffer) return empty;
  try {
    const exif = exifReader(exifBuffer);
    const gps = exif.GPSInfo;
    const lat = toDecimalDegrees(gps?.GPSLatitude, gps?.GPSLatitudeRef);
    const lng = toDecimalDegrees(gps?.GPSLongitude, gps?.GPSLongitudeRef);
    const taken = exif.Photo?.DateTimeOriginal;
    const hasPosition = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return {
      lat: hasPosition ? lat : null,
      lng: hasPosition ? lng : null,
      // EXIF dates have no timezone: keep the wall-clock time as written by the camera.
      takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString().slice(0, 19) : null,
    };
  } catch {
    return empty;
  }
}

/**
 * Turns an uploaded image into a resized JPEG and a thumbnail inside `destDir`.
 * The outputs carry no metadata (no GPS position, no camera details).
 */
export async function processPhoto(sourcePath: string, destDir: string, publicId: string): Promise<ProcessedPhoto> {
  const fileName = `${publicId}.jpg`;
  const thumbName = `${publicId}_thumb.jpg`;
  await fs.mkdir(destDir, { recursive: true });

  try {
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.format || !ACCEPTED_IMAGE_FORMATS.has(metadata.format)) {
      throw new UnsupportedMediaError("unsupported_image");
    }

    // rotate() applies the EXIF orientation, so portrait photos stay upright.
    const upright = sharp(sourcePath).rotate().flatten({ background: "#ffffff" });
    const fit = { fit: "inside", withoutEnlargement: true } as const;
    const main = await upright
      .clone()
      .resize({ width: PHOTO_MAX_DIMENSION, height: PHOTO_MAX_DIMENSION, ...fit })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(destDir, fileName));
    const thumb = await upright
      .clone()
      .resize({ width: THUMBNAIL_MAX_DIMENSION, height: THUMBNAIL_MAX_DIMENSION, ...fit })
      .jpeg({ quality: 72, mozjpeg: true })
      .toFile(path.join(destDir, thumbName));

    return {
      fileName,
      thumbName,
      width: main.width,
      height: main.height,
      sizeBytes: main.size + thumb.size,
      exif: readExif(metadata.exif),
    };
  } catch (error) {
    await fs.rm(path.join(destDir, fileName), { force: true });
    await fs.rm(path.join(destDir, thumbName), { force: true });
    // Anything sharp cannot decode (HEIC from some phones, corrupt files, non-images).
    throw error instanceof UnsupportedMediaError ? error : new UnsupportedMediaError("unsupported_image");
  }
}

export type VideoContainer = { extension: "mp4" | "webm"; mimeType: "video/mp4" | "video/webm" };

/**
 * Recognizes a video from its first bytes (never from its name or declared
 * type). MP4 and QuickTime (.mov, iPhone) share the same structure and are
 * both served as video/mp4, which browsers accept for either.
 */
export function detectVideoContainer(header: Uint8Array): VideoContainer | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...header.slice(start, end));
  if (header.length >= 12 && ascii(4, 8) === "ftyp") return { extension: "mp4", mimeType: "video/mp4" };
  const isEbml = header.length >= 4 && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
  return isEbml ? { extension: "webm", mimeType: "video/webm" } : null;
}

/** Moves an uploaded video into `destDir` as is (no transcoding in Phase 1). */
export async function storeVideo(
  sourcePath: string,
  destDir: string,
  publicId: string,
): Promise<{ fileName: string; mimeType: string; sizeBytes: number }> {
  const handle = await fs.open(sourcePath, "r");
  const header = new Uint8Array(16);
  let bytesRead: number;
  try {
    ({ bytesRead } = await handle.read(header, 0, header.length, 0));
  } finally {
    await handle.close();
  }
  const container = detectVideoContainer(header.slice(0, bytesRead));
  if (!container) throw new UnsupportedMediaError("unsupported_video");

  const fileName = `${publicId}.${container.extension}`;
  // The media folder is configured at runtime: keep the bundler from tracing it.
  const destination = path.join(/* turbopackIgnore: true */ destDir, fileName);
  await fs.mkdir(destDir, { recursive: true });
  await fs.rename(sourcePath, destination);
  const { size } = await fs.stat(destination);
  return { fileName, mimeType: container.mimeType, sizeBytes: size };
}
