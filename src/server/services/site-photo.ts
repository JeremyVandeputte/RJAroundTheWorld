// The site photo: a picture chosen in the administration, shown in a circle
// left of the site name in the header, and as the icon of the browser tab.
//
// Three square versions are kept (the original is not):
// - "nav": 96 px, shown at 32 px in the header (sharp on high-density screens);
// - "icon": 64 px, the tab icon, cut into a disc (transparent corners), as
//   in the header;
// - "large": 480 px, centred on the "À propos" page.
// The version (time of the last change) is part of their address, so a new
// photo is never hidden by a browser cache.

import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { Db } from "@/server/db/client";
import { siteSettings } from "@/server/db/schema";
import { canManageJournal, type Actor } from "@/server/permissions";

export const SITE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const SITE_PHOTO_SIZES = { nav: 96, icon: 64, large: 480 } as const;
export type SitePhotoSize = keyof typeof SITE_PHOTO_SIZES;

const VERSION_KEY = "site_photo_version";
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type SitePhotoResult =
  | { ok: true; version: number | null }
  | { ok: false; reason: "forbidden" | "too_large" | "unsupported_image" | "empty" };

function folder(mediaDir: string): string {
  // The media folder is configured at runtime: keep the bundler from tracing it.
  return path.join(/* turbopackIgnore: true */ mediaDir, "site");
}

export function sitePhotoPath(mediaDir: string, size: SitePhotoSize): string {
  return path.join(folder(mediaDir), `photo-${size}.png`);
}

/** Version of the current photo (used in its address), or null when there is none. */
export function getSitePhotoVersion(db: Db): number | null {
  const row = db.select().from(siteSettings).where(eq(siteSettings.key, VERSION_KEY)).get();
  const version = row ? Number(row.value) : NaN;
  return Number.isSafeInteger(version) ? version : null;
}

/** Address of the photo in one size, or null when there is none. */
export function sitePhotoUrl(version: number | null, size: SitePhotoSize): string | null {
  return version === null ? null : `/api/site-photo?size=${size}&v=${version}`;
}

/** White disc on a transparent square: keeps only the inside of the circle. */
function discMask(pixels: number): Buffer {
  const radius = pixels / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="#fff"/></svg>`,
  );
}

/** Replaces the site photo by this image. */
export async function saveSitePhoto(db: Db, actor: Actor, mediaDir: string, bytes: Uint8Array, now = new Date()): Promise<SitePhotoResult> {
  if (!canManageJournal(actor)) return { ok: false, reason: "forbidden" };
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > SITE_PHOTO_MAX_BYTES) return { ok: false, reason: "too_large" };

  let format: string | undefined;
  try {
    format = (await sharp(bytes).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) return { ok: false, reason: "unsupported_image" };

  await fs.mkdir(folder(mediaDir), { recursive: true });
  for (const [size, pixels] of Object.entries(SITE_PHOTO_SIZES) as [SitePhotoSize, number][]) {
    const target = sitePhotoPath(mediaDir, size);
    const temporary = `${target}.tmp`;
    // Upright, cut to a centred square; transparency is kept (a logo may have some).
    let image = sharp(bytes).rotate().resize(pixels, pixels, { fit: "cover", position: "attention" });
    // The header rounds its photo with CSS; a tab icon cannot be styled, so it is cut here.
    if (size === "icon") image = sharp(await image.png().toBuffer()).composite([{ input: discMask(pixels), blend: "dest-in" }]);
    await image.png().toFile(temporary);
    await fs.rename(temporary, target);
  }

  const version = now.getTime();
  db.insert(siteSettings)
    .values({ key: VERSION_KEY, value: String(version), updatedAt: now })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: String(version), updatedAt: now } })
    .run();
  return { ok: true, version };
}

/** Removes the site photo: the header shows the name alone, the tab its default icon. */
export async function removeSitePhoto(db: Db, actor: Actor, mediaDir: string): Promise<SitePhotoResult> {
  if (!canManageJournal(actor)) return { ok: false, reason: "forbidden" };
  db.delete(siteSettings).where(eq(siteSettings.key, VERSION_KEY)).run();
  for (const size of Object.keys(SITE_PHOTO_SIZES) as SitePhotoSize[]) {
    await fs.rm(sitePhotoPath(mediaDir, size), { force: true });
  }
  return { ok: true, version: null };
}
