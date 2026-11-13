import { getEnv } from "@/lib/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { buildTripExport } from "@/server/export/trip-export";
import { zipStream } from "@/server/export/zip";
import { plainNotFound } from "@/server/media/http";
import { getTripById } from "@/server/services/trips";

// GET /api/trips/<tripId>/export
// The trip as a ZIP archive (offline page, photos and videos, data), with
// what the person may see on the trip page. Streamed: large archives are
// never held in memory.
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!/^[1-9]\d{0,14}$/.test(tripId)) return plainNotFound();
  const viewer = await getCurrentUser();
  const trip = getTripById(getDb(), viewer, Number(tripId));
  if (!trip) return plainNotFound();
  const archive = await buildTripExport(getDb(), viewer, trip, getEnv().mediaDir);
  if (!archive) return plainNotFound();

  const chunks = zipStream(archive.sources);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      // The slug is plain ASCII: no encoding needed in the header.
      "Content-Disposition": `attachment; filename="${archive.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
