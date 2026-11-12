// Browser side of uploads. A file is sent in chunks: if the connection drops,
// only the chunk in flight is lost and it is retried automatically; after
// several failures the upload stops and can be resumed where it stopped.

export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const CHUNK_TIMEOUT_MS = 180_000;

export type UploadKind = "photo" | "video";
export type UploadedMedia = { publicId: string; kind: UploadKind; width: number | null; height: number | null };

export class UploadError extends Error {
  constructor(
    message: string,
    /** True when trying again later can succeed (network problem). */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const NETWORK_ERROR = "Connexion interrompue. Vérifiez le réseau, puis reprenez l'envoi : il repartira où il s'est arrêté.";
const GENERIC_ERROR = "L'envoi a échoué. Réessayez.";

type ChunkResponse = { status: number; body: Record<string, unknown> };

/** Sends one chunk. Resolves with the server answer, rejects on a network failure. */
function sendChunk(method: "POST" | "PUT", url: string, chunk: Blob, onProgress: (loaded: number) => void): Promise<ChunkResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    request.timeout = CHUNK_TIMEOUT_MS;
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(request.responseText) as Record<string, unknown>;
      } catch {
        // Not JSON (for instance an error page from a proxy): handled through the status.
      }
      resolve({ status: request.status, body });
    };
    const fail = () => reject(new Error("network"));
    request.onerror = fail;
    request.ontimeout = fail;
    request.onabort = fail;
    request.send(chunk);
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendChunkWithRetry(
  method: "POST" | "PUT",
  url: string,
  chunk: Blob,
  onProgress: (loaded: number) => void,
): Promise<ChunkResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await sendChunk(method, url, chunk, onProgress);
      // 5xx answers (server restarting, proxy timeout) are worth another try; 507 is a full disk.
      if (response.status < 500 || response.status === 507) return response;
    } catch {
      // Network failure: retried below.
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) throw new UploadError(NETWORK_ERROR, true);
    onProgress(0);
    await wait(delay);
  }
}

/**
 * Prepares the upload of a file to an entry. `run` can be called again after
 * a failure: it resumes from the last chunk the server confirmed.
 */
export function createUpload(entryId: number, file: File, kind: UploadKind) {
  let uploadId: string | null = null;
  let received = 0;

  async function run(onProgress: (sentBytes: number) => void): Promise<UploadedMedia> {
    let restarted = false;
    for (;;) {
      const chunk = file.slice(received, received + UPLOAD_CHUNK_BYTES);
      const isFirst = uploadId === null;
      const url = isFirst
        ? `/api/entries/${entryId}/media?kind=${kind}&size=${file.size}`
        : `/api/uploads/${uploadId}?offset=${received}`;
      const base = received;
      const { status, body } = await sendChunkWithRetry(isFirst ? "POST" : "PUT", url, chunk, (loaded) =>
        onProgress(Math.min(file.size, base + loaded)),
      );

      if (status === 201 && body.media) {
        onProgress(file.size);
        return body.media as UploadedMedia;
      }
      if (status === 202 && typeof body.uploadId === "string" && typeof body.received === "number") {
        uploadId = body.uploadId;
        received = body.received;
        continue;
      }
      if (status === 409 && typeof body.received === "number") {
        // The server is ahead or behind (a retried chunk had arrived after all): follow it.
        received = body.received;
        continue;
      }
      if (status === 404 && !isFirst && !restarted) {
        // The upload expired on the server: start again from the beginning, once.
        uploadId = null;
        received = 0;
        restarted = true;
        continue;
      }
      throw new UploadError(typeof body.error === "string" ? body.error : GENERIC_ERROR, false);
    }
  }

  return { run };
}

/** Photo or video, from the type announced by the browser or the file extension. */
export function detectUploadKind(file: File): UploadKind | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension)) return "photo";
  if (["mp4", "mov", "m4v", "webm"].includes(extension)) return "video";
  return null;
}
