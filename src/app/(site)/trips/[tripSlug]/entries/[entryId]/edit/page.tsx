import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteEntryForm } from "@/components/entry/delete-entry-form";
import { EntryForm } from "@/components/entry/entry-form";
import { MediaManager } from "@/components/entry/media-manager";
import { Badge } from "@/components/ui/badge";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db/client";
import { loadEntry } from "@/server/page-data";
import { canEditEntry } from "@/server/permissions";
import { listTaggableUsers, listTripMapEntries } from "@/server/services/entries";
import { listEntryMedia } from "@/server/services/media";

export const metadata: Metadata = { title: "Modifier l'entrée" };

export default async function EditEntryPage({ params }: { params: Promise<{ tripSlug: string; entryId: string }> }) {
  const { tripSlug, entryId } = await params;
  const { viewer, trip, detail } = await loadEntry(tripSlug, entryId);
  if (!trip || !detail || !canEditEntry(viewer, trip, detail.entry)) notFound();
  const { entry, people } = detail;
  const env = getEnv();

  // Keep already identified people selectable even if their account was deactivated since.
  const taggable = listTaggableUsers(getDb(), viewer);
  const options = [...taggable, ...people.filter((person) => !taggable.some((user) => user.id === person.id))];

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href={`/trips/${trip.slug}/entries/${entry.id}`}
        className="text-sm text-accent underline-offset-4 hover:underline"
      >
        ← {entry.title}
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Modifier l&apos;entrée</h1>
        <Badge tone={entry.status === "draft" ? "warning" : "accent"}>
          {entry.status === "draft" ? "Brouillon" : "Publiée"}
        </Badge>
      </div>

      <EntryForm
        tripId={trip.id}
        people={options}
        tripPoints={listTripMapEntries(getDb(), viewer, trip).map((item) => item.pointA)}
        entry={{
          id: entry.id,
          date: entry.date,
          title: entry.title,
          body: entry.body,
          status: entry.status,
          pointA: { lat: entry.pointALat, lng: entry.pointALng, name: entry.pointAName },
          pointB: { lat: entry.pointBLat, lng: entry.pointBLng, name: entry.pointBName },
          peopleIds: people.map((person) => person.id),
        }}
      />

      <section id="media" aria-labelledby="media-title" className="mt-10 scroll-mt-4 border-t border-line pt-6">
        <h2 id="media-title" className="mb-4 text-lg font-semibold">
          Photos et vidéos
        </h2>
        <MediaManager
          entryId={entry.id}
          initialItems={listEntryMedia(getDb(), viewer, trip, entry)}
          maxPhotoBytes={env.maxPhotoBytes}
          maxVideoBytes={env.maxVideoBytes}
        />
      </section>

      <div className="mt-10 border-t border-line pt-4">
        <DeleteEntryForm entryId={entry.id} />
      </div>
    </div>
  );
}
