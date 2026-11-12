import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { readChunk, uploadResponse } from "@/server/media/http";
import { readUploadSession } from "@/server/media/storage";
import { continueUpload } from "@/server/media/upload";

// PUT /api/uploads/<uploadId>?offset=<bytes already sent>
// Body: the next chunk of an upload in progress.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  const env = getEnv();
  const offsetText = request.nextUrl.searchParams.get("offset") ?? "";
  // Only used to word a "too large" message; the upload itself is checked below.
  const kind = (await readUploadSession(env.mediaDir, uploadId))?.kind ?? "photo";

  if (!/^\d{1,15}$/.test(offsetText)) return uploadResponse({ ok: false, reason: "invalid_request" }, kind);
  const chunk = await readChunk(request);
  if (!chunk) return uploadResponse({ ok: false, reason: "chunk_too_large" }, kind);

  const result = await continueUpload(getDb(), env, await getCurrentUser(), uploadId, Number(offsetText), chunk);
  return uploadResponse(result, kind);
}
