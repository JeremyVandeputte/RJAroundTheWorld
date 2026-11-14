import { readFile } from "node:fs/promises";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { messages } from "@/lib/messages";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { plainNotFound } from "@/server/media/http";
import {
  getSitePhotoVersion,
  removeSitePhoto,
  saveSitePhoto,
  SITE_PHOTO_MAX_BYTES,
  sitePhotoPath,
  type SitePhotoResult,
  type SitePhotoSize,
} from "@/server/services/site-photo";

// GET    /api/site-photo?size=nav|icon&v=<version>  the site photo (header, tab icon)
// POST   /api/site-photo                             body: the new image
// DELETE /api/site-photo
//
// Like everything else, only answered with the secret link's cookie (src/proxy.ts).
// Reading needs no account: the header of the login page shows the photo too.

const STATUS: Record<Extract<SitePhotoResult, { ok: false }>["reason"], number> = {
  forbidden: 403,
  too_large: 413,
  unsupported_image: 415,
  empty: 400,
};

function answer(result: SitePhotoResult, done: string): Response {
  const headers = { "Cache-Control": "no-store" };
  return result.ok
    ? Response.json({ version: result.version, message: done }, { headers })
    : Response.json({ error: messages.sitePhoto[result.reason] }, { status: STATUS[result.reason], headers });
}

export async function GET(request: NextRequest) {
  const size = request.nextUrl.searchParams.get("size");
  if (size !== "nav" && size !== "icon") return plainNotFound();
  const version = getSitePhotoVersion(getDb());
  if (version === null) return plainNotFound();
  try {
    const file = await readFile(sitePhotoPath(getEnv().mediaDir, size as SitePhotoSize));
    // The version is in the address: the same address always gives the same picture.
    const cache = request.nextUrl.searchParams.get("v") === String(version) ? "private, max-age=31536000, immutable" : "no-store";
    return new Response(new Uint8Array(file), { headers: { "Content-Type": "image/png", "Cache-Control": cache } });
  } catch {
    return plainNotFound();
  }
}

export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > SITE_PHOTO_MAX_BYTES) return answer({ ok: false, reason: "too_large" }, "");
  const bytes = new Uint8Array(await request.arrayBuffer());
  const result = await saveSitePhoto(getDb(), await getCurrentUser(), getEnv().mediaDir, bytes);
  return answer(result, messages.sitePhoto.saved);
}

export async function DELETE() {
  const result = await removeSitePhoto(getDb(), await getCurrentUser(), getEnv().mediaDir);
  return answer(result, messages.sitePhoto.removed);
}
