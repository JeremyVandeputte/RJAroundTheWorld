import fs from "node:fs";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import type { UploadConfig } from "@/server/media/upload";
import {
  getSitePhotoVersion,
  removeSitePhoto,
  saveSitePhoto,
  SITE_PHOTO_MAX_BYTES,
  sitePhotoPath,
  sitePhotoUrl,
} from "@/server/services/site-photo";
import { insertCast, insertUser } from "./helpers/fixtures";
import { createMediaConfig, removeMediaDir, samplePhoto } from "./helpers/media";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let config: UploadConfig;

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  config = createMediaConfig();
});
afterEach(() => removeMediaDir(config));

describe("site photo", () => {
  it("keeps two small square versions and gives them a versioned address", async () => {
    expect(getSitePhotoVersion(db)).toBeNull();
    expect(sitePhotoUrl(null, "nav")).toBeNull();

    const photo = await samplePhoto({ width: 1200, height: 800 });
    const result = await saveSitePhoto(db, cast.superuser, config.mediaDir, photo, new Date(1_800_000_000_000));
    expect(result).toEqual({ ok: true, version: 1_800_000_000_000 });
    expect(getSitePhotoVersion(db)).toBe(1_800_000_000_000);
    expect(sitePhotoUrl(1_800_000_000_000, "icon")).toBe("/api/site-photo?size=icon&v=1800000000000");

    for (const [size, pixels] of [["nav", 96], ["icon", 64], ["large", 480]] as const) {
      const meta = await sharp(sitePhotoPath(config.mediaDir, size)).metadata();
      expect(meta).toMatchObject({ format: "png", width: pixels, height: pixels });
    }
  });

  it("cuts the tab icon into a disc with transparent corners, and only the tab icon", async () => {
    await saveSitePhoto(db, cast.superuser, config.mediaDir, await samplePhoto({ width: 800, height: 600 }));
    const alphaAt = async (size: "icon" | "nav", x: number, y: number) => {
      const { data, info } = await sharp(sitePhotoPath(config.mediaDir, size)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return data[(y * info.width + x) * info.channels + 3];
    };
    expect(await alphaAt("icon", 0, 0)).toBe(0);
    expect(await alphaAt("icon", 63, 63)).toBe(0);
    expect(await alphaAt("icon", 32, 32)).toBe(255);
    expect(await alphaAt("icon", 32, 1)).toBeGreaterThan(200);
    // The header photo stays square: CSS rounds it.
    expect(await alphaAt("nav", 0, 0)).toBe(255);
  });

  it("replaces the previous photo with a new version", async () => {
    await saveSitePhoto(db, cast.superuser, config.mediaDir, await samplePhoto({ width: 400, height: 400 }), new Date(1000));
    await saveSitePhoto(db, cast.superuser, config.mediaDir, await samplePhoto({ width: 300, height: 600, format: "png" }), new Date(2000));
    expect(getSitePhotoVersion(db)).toBe(2000);
  });

  it("is removed with its files", async () => {
    await saveSitePhoto(db, cast.superuser, config.mediaDir, await samplePhoto({ width: 400, height: 400 }));
    expect(await removeSitePhoto(db, cast.superuser, config.mediaDir)).toEqual({ ok: true, version: null });
    expect(getSitePhotoVersion(db)).toBeNull();
    expect(fs.existsSync(sitePhotoPath(config.mediaDir, "nav"))).toBe(false);
    expect(fs.existsSync(sitePhotoPath(config.mediaDir, "icon"))).toBe(false);
    expect(fs.existsSync(sitePhotoPath(config.mediaDir, "large"))).toBe(false);
  });

  it("is changed only by the people who run the journal", async () => {
    const photo = await samplePhoto({ width: 400, height: 400 });
    const editor = insertUser(db, "chloe", { canPublish: true, canManageTrips: true });
    for (const actor of [cast.guest, cast.publisher, cast.manager, null]) {
      expect(await saveSitePhoto(db, actor, config.mediaDir, photo)).toEqual({ ok: false, reason: "forbidden" });
      expect(await removeSitePhoto(db, actor, config.mediaDir)).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(getSitePhotoVersion(db)).toBeNull();
    expect((await saveSitePhoto(db, editor, config.mediaDir, photo)).ok).toBe(true);
  });

  it("refuses what is not an image, an empty file or a file too large", async () => {
    const text = new TextEncoder().encode("not an image");
    expect(await saveSitePhoto(db, cast.superuser, config.mediaDir, text)).toEqual({ ok: false, reason: "unsupported_image" });
    expect(await saveSitePhoto(db, cast.superuser, config.mediaDir, new Uint8Array())).toEqual({ ok: false, reason: "empty" });
    expect(await saveSitePhoto(db, cast.superuser, config.mediaDir, new Uint8Array(SITE_PHOTO_MAX_BYTES + 1))).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(getSitePhotoVersion(db)).toBeNull();
  });
});
