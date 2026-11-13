import type { Metadata } from "next";
import Link from "next/link";
import { TripMap, type TripMapEntry } from "@/components/map/trip-map";
import { Badge } from "@/components/ui/badge";
import { formatDateRange } from "@/lib/dates";
import { tripColor } from "@/lib/map-colors";
import { getViewer } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { listGlobalMap } from "@/server/services/global-map";

export const metadata: Metadata = { title: "Carte de tous les voyages" };

export default async function GlobalMapPage() {
  const viewer = await getViewer();
  // Only published entries of trips this viewer may see are sent to the browser.
  const trips = listGlobalMap(getDb(), viewer);
  // Colours are given from the oldest trip: a new trip does not change the others'.
  const colorOf = (index: number) => tripColor(trips.length - 1 - index);
  const markers: TripMapEntry[] = trips.flatMap(({ trip, entries }, index) =>
    entries.map((entry) => ({
      ...entry,
      href: `/trips/${trip.slug}/entries/${entry.id}`,
      color: colorOf(index),
      context: trip.title,
    })),
  );

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm text-accent underline-offset-4 hover:underline">
          ← Voyages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Carte de tous les voyages</h1>
      </div>

      {markers.length === 0 ? (
        <p className="text-muted">Aucun lieu à afficher pour le moment.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Touchez un marqueur pour ouvrir l&apos;entrée correspondante.</p>
          <TripMap entries={markers} className="h-[65dvh] min-h-80" />
          <ul aria-label="Voyages sur la carte" className="space-y-1">
            {trips.map(({ trip, entries }, index) => (
              <li key={trip.id}>
                <Link
                  href={`/trips/${trip.slug}/map`}
                  className="flex min-h-11 items-center gap-3 rounded-md px-1 hover:bg-white"
                >
                  <span aria-hidden="true" className="size-4 shrink-0 rounded-full" style={{ backgroundColor: colorOf(index).fill }} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{trip.title}</span>{" "}
                    <span className="text-sm text-muted">
                      {formatDateRange(trip.startDate, trip.endDate)} · {entries.length} entrée{entries.length > 1 ? "s" : ""}
                    </span>
                  </span>
                  {!trip.isVisible ? <Badge tone="warning">Non visible</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
