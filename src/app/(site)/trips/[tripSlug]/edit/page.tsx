import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteTripForm } from "@/components/trips/delete-trip-form";
import { TripForm } from "@/components/trips/trip-form";
import { getDb } from "@/server/db/client";
import { loadTrip } from "@/server/page-data";
import { canDeleteTrip, canManageTrips } from "@/server/permissions";
import { countTripEntries } from "@/server/services/trips";

export const metadata: Metadata = { title: "Modifier le voyage" };

export default async function EditTripPage({ params }: { params: Promise<{ tripSlug: string }> }) {
  const { viewer, trip } = await loadTrip((await params).tripSlug);
  if (!trip || !canManageTrips(viewer)) notFound();
  const entryCount = countTripEntries(getDb(), trip.id);

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/trips/${trip.slug}`} className="text-sm text-accent underline-offset-4 hover:underline">
        ← {trip.title}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Modifier le voyage</h1>
      <TripForm
        trip={{
          id: trip.id,
          title: trip.title,
          description: trip.description,
          startDate: trip.startDate,
          endDate: trip.endDate,
          isVisible: trip.isVisible,
        }}
      />

      <div className="mt-10 border-t border-line pt-4">
        <DeleteTripForm
          tripId={trip.id}
          entryCount={entryCount}
          canDelete={canDeleteTrip(viewer, { hasEntries: entryCount > 0 })}
        />
      </div>
    </div>
  );
}
