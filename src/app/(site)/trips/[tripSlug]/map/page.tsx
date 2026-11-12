import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TripMap } from "@/components/map/trip-map";
import { getDb } from "@/server/db/client";
import { loadTrip } from "@/server/page-data";
import { listTripMapEntries } from "@/server/services/entries";

type TripMapPageProps = { params: Promise<{ tripSlug: string }> };

export async function generateMetadata({ params }: TripMapPageProps): Promise<Metadata> {
  const { trip } = await loadTrip((await params).tripSlug);
  return trip ? { title: `Carte · ${trip.title}` } : {};
}

export default async function TripMapPage({ params }: TripMapPageProps) {
  const { viewer, trip } = await loadTrip((await params).tripSlug);
  if (!trip) notFound();
  // Only published entries this viewer may see are sent to the browser.
  const entries = listTripMapEntries(getDb(), viewer, trip);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/trips/${trip.slug}`} className="text-sm text-accent underline-offset-4 hover:underline">
          ← {trip.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Carte</h1>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted">Aucun lieu à afficher pour le moment.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Touchez un marqueur pour ouvrir l&apos;entrée correspondante.</p>
          <TripMap entries={entries} entryLinkBase={`/trips/${trip.slug}/entries/`} className="h-[70dvh] min-h-80" />
        </>
      )}
    </div>
  );
}
