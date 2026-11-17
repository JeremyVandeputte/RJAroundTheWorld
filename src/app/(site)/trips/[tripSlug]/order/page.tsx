import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryOrderEditor, type OrderDay } from "@/components/trips/entry-order-editor";
import { LinkButton } from "@/components/ui/link-button";
import { thumbnailUrl } from "@/lib/media-url";
import { getDb } from "@/server/db/client";
import { loadTrip } from "@/server/page-data";
import { canEditTrip } from "@/server/permissions";
import { listEntries } from "@/server/services/entries";
import { listCoverPhotos } from "@/server/services/media";

export const metadata: Metadata = { title: "Ordre des entrées" };

export default async function EntryOrderPage({ params }: { params: Promise<{ tripSlug: string }> }) {
  const { viewer, trip } = await loadTrip((await params).tripSlug);
  // Only the people who can modify the trip; the others get the same answer as an unknown page.
  if (!trip || !canEditTrip(viewer, trip)) notFound();
  const entries = listEntries(getDb(), viewer, trip);
  const covers = listCoverPhotos(
    getDb(),
    entries.map((entry) => entry.id),
  );

  // Grouped by day, in the order of the journal.
  const days: OrderDay[] = [];
  for (const entry of entries) {
    const item = {
      id: entry.id,
      title: entry.title,
      authorName: entry.authorName,
      isDraft: entry.status === "draft",
      thumbnailUrl: covers.has(entry.id) ? thumbnailUrl(covers.get(entry.id)!.publicId) : null,
    };
    const last = days.at(-1);
    if (last?.date === entry.date) last.entries.push(item);
    else days.push({ date: entry.date, entries: [item] });
  }
  const hasSeveral = days.some((day) => day.entries.length > 1);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/trips/${trip.slug}`} className="text-sm text-accent underline-offset-4 hover:underline">
          ← {trip.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ordre des entrées</h1>
        <p className="mt-1 text-muted">
          {hasSeveral
            ? "Les flèches changent l'ordre des entrées d'un même jour ; chaque changement est enregistré aussitôt. Le journal, la carte et l'archive suivent cet ordre."
            : "Aucun jour n'a plusieurs entrées : il n'y a pas d'ordre à changer pour le moment."}
        </p>
      </div>

      {days.length === 0 ? <p className="text-muted">Aucune entrée pour le moment.</p> : <EntryOrderEditor days={days} />}

      <LinkButton href={`/trips/${trip.slug}`} variant="primary">
        Terminé
      </LinkButton>
    </div>
  );
}
