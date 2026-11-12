import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { readChunk, uploadResponse } from "@/server/media/http";
import { startUpload } from "@/server/media/upload";

// POST /api/entries/<entryId>/media?kind=photo|video&size=<bytes>
// Body: the first chunk of the file (the whole file when it is small).
export async function POST(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const query = request.nextUrl.searchParams;
  const kind = query.get("kind") === "video" ? "video" : "photo";
  const size = Number(query.get("size"));

  const isValid = /^[1-9]\d{0,14}$/.test(entryId) && (query.get("kind") === "photo" || query.get("kind") === "video");
  const chunk = isValid ? await readChunk(request) : null;
  if (!isValid) return uploadResponse({ ok: false, reason: "invalid_request" }, kind);
  if (!chunk) return uploadResponse({ ok: false, reason: "chunk_too_large" }, kind);

  const result = await startUpload(getDb(), getEnv(), await getCurrentUser(), Number(entryId), { kind, size }, chunk);
  return uploadResponse(result, kind);
}
