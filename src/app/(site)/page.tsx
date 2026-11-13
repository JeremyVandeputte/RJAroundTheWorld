import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { formatDateRange } from "@/lib/dates";
import { thumbnailUrl } from "@/lib/media-url";
import { getViewer } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { canCreateTrip } from "@/server/permissions";
import { listTripCovers } from "@/server/services/media";
import { listTrips } from "@/server/services/trips";

export default async function HomePage() {
  const viewer = await getViewer();
  const trips = listTrips(getDb(), viewer);
  const covers = listTripCovers(getDb(), trips);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Voyages</h1>
        <div className="flex flex-wrap gap-3">
          {trips.length > 0 ? <LinkButton href="/map">Carte de tous les voyages</LinkButton> : null}
          {canCreateTrip(viewer) ? <LinkButton href="/trips/new">Nouveau voyage</LinkButton> : null}
        </div>
      </div>

      {trips.length === 0 ? (
        <p className="text-muted">Aucun voyage pour le moment.</p>
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/trips/${trip.slug}`}
                className="block overflow-hidden rounded-md border border-line bg-white hover:border-accent/50"
              >
                {covers.has(trip.id) ? (
                  <img
                    src={thumbnailUrl(covers.get(trip.id)!.publicId)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[5/2] w-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="block aspect-[5/2] w-full bg-gradient-to-br from-accent/15 to-line" />
                )}
                <span className="block px-4 py-4">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold">{trip.title}</span>
                  {!trip.isVisible ? <Badge tone="warning">Non visible</Badge> : null}
                </span>
                <span className="mt-1 block text-sm text-muted">{formatDateRange(trip.startDate, trip.endDate)}</span>
                {trip.description ? <span className="mt-2 block">{trip.description}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
