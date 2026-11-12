import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { UploadConfig } from "@/server/media/upload";

const MB = 1024 * 1024;

/** Temporary MEDIA_DIR for a test, with small limits by default. */
export function createMediaConfig(overrides: Partial<UploadConfig> = {}): UploadConfig {
  return {
    mediaDir: fs.mkdtempSync(path.join(os.tmpdir(), "rj-media-test-")),
    maxPhotoBytes: 10 * MB,
    maxVideoBytes: 300 * MB,
    mediaQuotaBytes: 1024 * MB,
    ...overrides,
  };
}

export function removeMediaDir(config: UploadConfig): void {
  fs.rmSync(config.mediaDir, { recursive: true, force: true });
}

/** Every file below MEDIA_DIR, as relative paths with forward slashes. */
export function listFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    return item.isDirectory() ? listFiles(full, base) : [path.relative(base, full).replaceAll("\\", "/")];
  });
}

type SamplePhoto = { width?: number; height?: number; format?: "jpeg" | "png" | "webp"; withExif?: boolean; orientation?: number };

/** A real image file, optionally carrying a GPS position, a capture date and an EXIF orientation. */
export async function samplePhoto({ width = 3000, height = 2000, format = "jpeg", withExif = false, orientation }: SamplePhoto = {}) {
  let image = sharp({ create: { width, height, channels: 3, background: "#c0392b" } });
  if (withExif) {
    image = image.withExif({
      IFD0: { Make: "TestCam" },
      IFD2: { DateTimeOriginal: "2026:11:11 10:20:30" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "14/1 36/1 13/1", GPSLongitudeRef: "W", GPSLongitude: "61/1 4/1 27/1" },
    });
  }
  if (orientation) image = image.withMetadata({ orientation });
  return new Uint8Array(await image.toFormat(format).toBuffer());
}

/** Bytes that start like an MP4/MOV file ("ftyp" box), followed by filler. */
export function sampleVideo(size: number, brand = "mp42"): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) % 251;
  // Files too small to hold the header are just filler (used to test limits).
  if (size >= 12) {
    bytes.set([0, 0, 0, 24], 0);
    bytes.set(new TextEncoder().encode(`ftyp${brand}`), 4);
  }
  return bytes;
}

export function sampleWebm(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(1);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return bytes;
}
