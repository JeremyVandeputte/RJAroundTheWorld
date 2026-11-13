import { getEnv } from "@/lib/env";
import { messages } from "@/lib/messages";
import type { MediaKind } from "@/server/db/schema";
import { MAX_CHUNK_BYTES, type UploadResult } from "./upload";

// Helpers shared by the upload route handlers.

const STATUS_BY_REASON: Record<Extract<UploadResult, { ok: false }>["reason"], number> = {
  not_found: 404,
  upload_not_found: 404,
  forbidden: 403,
  invalid_request: 400,
  too_many: 400,
  too_large: 413,
  chunk_too_large: 413,
  quota_exceeded: 507,
  unsupported_image: 415,
  unsupported_video: 415,
  offset_mismatch: 409,
};

/** Same body as the gate's answer: gives nothing away. */
export function plainNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Reads one chunk from the request, refusing oversized bodies before buffering them. */
export async function readChunk(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_CHUNK_BYTES) return null;
  const chunk = new Uint8Array(await request.arrayBuffer());
  return chunk.byteLength > MAX_CHUNK_BYTES ? null : chunk;
}

/** JSON answer understood by the upload code in the browser. */
export function uploadResponse(result: UploadResult, kind: MediaKind): Response {
  const noStore = { "Cache-Control": "no-store" };
  if (result.ok) {
    return result.status === "complete"
      ? Response.json({ media: { ...result.media, position: result.position ?? null } }, { status: 201, headers: noStore })
      : Response.json({ uploadId: result.uploadId, received: result.received }, { status: 202, headers: noStore });
  }

  const env = getEnv();
  const error =
    result.reason === "too_large"
      ? messages.media.too_large(kind, kind === "photo" ? env.maxPhotoBytes : env.maxVideoBytes)
      : messages.media[result.reason];
  const body = result.reason === "offset_mismatch" ? { error, received: result.received } : { error };
  return Response.json(body, { status: STATUS_BY_REASON[result.reason], headers: noStore });
}
