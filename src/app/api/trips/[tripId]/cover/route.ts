import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { readChunk, uploadResponse } from "@/server/media/http";
import { startTripCoverUpload } from "@/server/media/upload";

// POST /api/trips/<tripId>/cover?size=<bytes>
// Body: the first chunk of a photo that becomes the trip's thumbnail.
// Following chunks go to PUT /api/uploads/<uploadId>, like any upload.
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const size = Number(request.nextUrl.searchParams.get("size"));
  if (!/^[1-9]\d{0,14}$/.test(tripId)) return uploadResponse({ ok: false, reason: "invalid_request" }, "photo");
  const chunk = await readChunk(request);
  if (!chunk) return uploadResponse({ ok: false, reason: "chunk_too_large" }, "photo");

  const result = await startTripCoverUpload(getDb(), getEnv(), await getCurrentUser(), Number(tripId), size, chunk);
  return uploadResponse(result, "photo");
}
