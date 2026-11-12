import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectVideoContainer,
  processPhoto,
  storeVideo,
  UnsupportedMediaError,
} from "@/server/media/processing";
import { parseRangeHeader } from "@/server/media/range";
import { resolveMediaPath } from "@/server/media/storage";
import type { UploadConfig } from "@/server/media/upload";
import { createMediaConfig, listFiles, removeMediaDir, samplePhoto, sampleVideo, sampleWebm } from "./helpers/media";

let config: UploadConfig;
let dest: string;

function writeSource(bytes: Uint8Array): string {
  const file = path.join(config.mediaDir, "source.bin");
  fs.writeFileSync(file, bytes);
  return file;
}

beforeEach(() => {
  config = createMediaConfig();
  dest = path.join(config.mediaDir, "1");
});
afterEach(() => removeMediaDir(config));

describe("photo processing", () => {
  it("resizes large photos to 2000 px on the longest side and creates a thumbnail", async () => {
    const photo = await processPhoto(writeSource(await samplePhoto({ width: 4000, height: 3000 })), dest, "abc");
    expect(photo).toMatchObject({ fileName: "abc.jpg", thumbName: "abc_thumb.jpg", width: 2000, height: 1500 });

    const main = await sharp(path.join(dest, "abc.jpg")).metadata();
    const thumb = await sharp(path.join(dest, "abc_thumb.jpg")).metadata();
    expect([main.format, main.width, main.height]).toEqual(["jpeg", 2000, 1500]);
    expect([thumb.format, thumb.width, thumb.height]).toEqual(["jpeg", 480, 360]);
    expect(photo.sizeBytes).toBe(fs.statSync(path.join(dest, "abc.jpg")).size + fs.statSync(path.join(dest, "abc_thumb.jpg")).size);
  });

  it("never enlarges a small photo", async () => {
    const photo = await processPhoto(writeSource(await samplePhoto({ width: 800, height: 600 })), dest, "abc");
    expect([photo.width, photo.height]).toEqual([800, 600]);
  });

  it("keeps portrait photos upright (EXIF orientation applied)", async () => {
    const sideways = await samplePhoto({ width: 3000, height: 2000, orientation: 6 });
    const photo = await processPhoto(writeSource(sideways), dest, "abc");
    expect([photo.width, photo.height]).toEqual([1333, 2000]);
  });

  it("converts PNG and WebP to JPEG", async () => {
    for (const format of ["png", "webp"] as const) {
      const photo = await processPhoto(writeSource(await samplePhoto({ width: 600, height: 400, format })), dest, format);
      expect((await sharp(path.join(dest, photo.fileName)).metadata()).format).toBe("jpeg");
    }
  });

  it("reads the GPS position and capture date, then strips all metadata from stored files", async () => {
    const photo = await processPhoto(writeSource(await samplePhoto({ withExif: true })), dest, "abc");
    expect(photo.exif.lat).toBeCloseTo(14.6036, 3);
    expect(photo.exif.lng).toBeCloseTo(-61.0742, 3);
    expect(photo.exif.takenAt).toBe("2026-11-11T10:20:30");

    for (const name of ["abc.jpg", "abc_thumb.jpg"]) {
      const stored = await sharp(path.join(dest, name)).metadata();
      expect(stored.exif).toBeUndefined();
      expect(fs.readFileSync(path.join(dest, name)).includes("TestCam")).toBe(false);
    }
  });

  it("copes with photos that carry no EXIF data", async () => {
    const photo = await processPhoto(writeSource(await samplePhoto({ width: 300, height: 200 })), dest, "abc");
    expect(photo.exif).toEqual({ lat: null, lng: null, takenAt: null });
  });

  it("refuses files that are not images and leaves nothing behind", async () => {
    const attempts = [new TextEncoder().encode("<script>alert(1)</script>"), sampleVideo(2000), new Uint8Array(10)];
    for (const bytes of attempts) {
      await expect(processPhoto(writeSource(bytes), dest, "abc")).rejects.toBeInstanceOf(UnsupportedMediaError);
    }
    expect(listFiles(dest)).toEqual([]);
  });
});

describe("video detection", () => {
  it("recognizes MP4, QuickTime and WebM from their first bytes", () => {
    expect(detectVideoContainer(sampleVideo(64, "mp42"))).toEqual({ extension: "mp4", mimeType: "video/mp4" });
    // iPhone .mov files: same structure, served as video/mp4.
    expect(detectVideoContainer(sampleVideo(64, "qt  "))).toEqual({ extension: "mp4", mimeType: "video/mp4" });
    expect(detectVideoContainer(sampleWebm(64))).toEqual({ extension: "webm", mimeType: "video/webm" });
  });

  it("refuses anything else, whatever its name or declared type", async () => {
    expect(detectVideoContainer(new TextEncoder().encode("<html><body>not a video</body></html>"))).toBeNull();
    expect(detectVideoContainer(await samplePhoto({ width: 50, height: 50 }))).toBeNull();
    expect(detectVideoContainer(new Uint8Array(3))).toBeNull();
    await expect(storeVideo(writeSource(new Uint8Array(500)), dest, "abc")).rejects.toMatchObject({
      reason: "unsupported_video",
    });
  });

  it("stores a video unchanged", async () => {
    const bytes = sampleVideo(5000);
    const video = await storeVideo(writeSource(bytes), dest, "abc");
    expect(video).toEqual({ fileName: "abc.mp4", mimeType: "video/mp4", sizeBytes: 5000 });
    expect(new Uint8Array(fs.readFileSync(path.join(dest, "abc.mp4")))).toEqual(bytes);
  });
});

describe("stored file paths", () => {
  it("never resolve outside the media folder", () => {
    const root = path.resolve(config.mediaDir);
    expect(resolveMediaPath(config.mediaDir, "12/abc.jpg")).toBe(path.join(root, "12", "abc.jpg"));
    for (const hostile of ["../secret.txt", "12/../../secret.txt", "..", "", path.resolve(root, "..", "x")]) {
      expect(resolveMediaPath(config.mediaDir, hostile), hostile).toBeNull();
    }
  });
});

describe("range requests", () => {
  it("returns null when the whole file should be sent", () => {
    expect(parseRangeHeader(null, 1000)).toBeNull();
    expect(parseRangeHeader("bytes=-", 1000)).toBeNull();
    expect(parseRangeHeader("items=0-10", 1000)).toBeNull();
    expect(parseRangeHeader("bytes=0-10,20-30", 1000)).toBeNull();
  });

  it("parses the forms used by video players", () => {
    expect(parseRangeHeader("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRangeHeader("bytes=0-1", 1000)).toEqual({ start: 0, end: 1 });
    expect(parseRangeHeader("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRangeHeader("bytes=200-299", 1000)).toEqual({ start: 200, end: 299 });
    expect(parseRangeHeader("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRangeHeader("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRangeHeader("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("flags ranges outside the file", () => {
    expect(parseRangeHeader("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=500-100", 1000)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=0-", 0)).toBe("unsatisfiable");
  });
});
