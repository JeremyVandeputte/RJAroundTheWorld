import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { plainNotFound } from "@/server/media/http";
import { parseRangeHeader } from "@/server/media/range";
import { PUBLIC_ID_PATTERN, resolveMediaPath } from "@/server/media/storage";
import { getMediaForViewing } from "@/server/services/media";

// GET /api/media/<publicId>            the photo or the video
// GET /api/media/<publicId>?size=thumb the thumbnail of a photo
//
// Files are never exposed by a public URL: this route applies the same
// visibility rules as the entry page (secret link, hidden trip, draft).
export async function GET(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!PUBLIC_ID_PATTERN.test(publicId)) return plainNotFound();

  const media = getMediaForViewing(getDb(), await getCurrentUser(), publicId);
  if (!media) return plainNotFound();

  const wantsThumbnail = request.nextUrl.searchParams.get("size") === "thumb";
  const relativePath = wantsThumbnail ? media.thumbPath : media.filePath;
  const absolutePath = relativePath ? resolveMediaPath(getEnv().mediaDir, relativePath) : null;
  if (!absolutePath) return plainNotFound();

  let size: number;
  try {
    size = (await stat(absolutePath)).size;
  } catch {
    return plainNotFound();
  }

  const headers = new Headers({
    "Content-Type": wantsThumbnail ? "image/jpeg" : media.mimeType,
    "Accept-Ranges": "bytes",
    // Private content: browsers may keep it (a file never changes), shared caches may not.
    // A video waiting for conversion will be replaced by the converted file: not kept.
    "Cache-Control": media.processing === "pending" ? "private, no-store" : "private, max-age=604800, immutable",
    "Content-Disposition": "inline",
  });

  const range = parseRangeHeader(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);

  const body = size === 0 ? null : (Readable.toWeb(createReadStream(absolutePath, { start, end })) as ReadableStream);
  return new Response(body, { status: range ? 206 : 200, headers });
}
