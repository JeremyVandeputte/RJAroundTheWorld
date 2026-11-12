import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryForm } from "@/components/entry/entry-form";
import { getDb } from "@/server/db/client";
import { loadTrip } from "@/server/page-data";
import { canCreateEntry } from "@/server/permissions";
import { listTaggableUsers, listTripMapEntries } from "@/server/services/entries";

export const metadata: Metadata = { title: "Nouvelle entrée" };

export default async function NewEntryPage({ params }: { params: Promise<{ tripSlug: string }> }) {
  const { viewer, trip } = await loadTrip((await params).tripSlug);
  if (!trip || !canCreateEntry(viewer, trip)) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/trips/${trip.slug}`} className="text-sm text-accent underline-offset-4 hover:underline">
        ← {trip.title}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Nouvelle entrée</h1>
      <EntryForm
        tripId={trip.id}
        people={listTaggableUsers(getDb(), viewer)}
        tripPoints={listTripMapEntries(getDb(), viewer, trip).map((entry) => entry.pointA)}
      />
    </div>
  );
}
