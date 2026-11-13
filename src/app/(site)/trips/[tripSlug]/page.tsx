import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TagList } from "@/components/tags/tag-list";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { formatDate, formatDateRange } from "@/lib/dates";
import { thumbnailUrl } from "@/lib/media-url";
import { getDb } from "@/server/db/client";
import { loadTrip } from "@/server/page-data";
import { canCreateEntry, canEditTrip } from "@/server/permissions";
import { listEntries } from "@/server/services/entries";
import { listCoverPhotos } from "@/server/services/media";

type TripPageProps = { params: Promise<{ tripSlug: string }> };

export async function generateMetadata({ params }: TripPageProps): Promise<Metadata> {
  const { trip } = await loadTrip((await params).tripSlug);
  return trip ? { title: trip.title } : {};
}

export default async function TripPage({ params }: TripPageProps) {
  const { viewer, trip } = await loadTrip((await params).tripSlug);
  if (!trip) notFound();
  const entries = listEntries(getDb(), viewer, trip);
  // Covers are looked up only for the entries this viewer is allowed to see.
  const covers = listCoverPhotos(
    getDb(),
    entries.map((entry) => entry.id),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-accent underline-offset-4 hover:underline">
          ← Voyages
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{trip.title}</h1>
          {!trip.isVisible ? <Badge tone="warning">Non visible</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">{formatDateRange(trip.startDate, trip.endDate)}</p>
        {trip.description ? <p className="mt-3">{trip.description}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <LinkButton href={`/trips/${trip.slug}/map`}>Carte</LinkButton>
        {canCreateEntry(viewer, trip) ? (
          <LinkButton href={`/trips/${trip.slug}/entries/new`} variant="primary">
            Nouvelle entrée
          </LinkButton>
        ) : null}
        {canEditTrip(viewer, trip) ? <LinkButton href={`/trips/${trip.slug}/edit`}>Modifier le voyage</LinkButton> : null}
      </div>

      <section aria-labelledby="entries-title">
        <h2 id="entries-title" className="text-lg font-semibold">
          Journal
        </h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-muted">Aucune entrée pour le moment.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/trips/${trip.slug}/entries/${entry.id}`}
                  className="flex items-center gap-3 rounded-md border border-line bg-white px-4 py-3 hover:border-accent/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-muted">{formatDate(entry.date)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{entry.title}</span>
                      {entry.status === "draft" ? <Badge tone="warning">Brouillon</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">par {entry.authorName}</span>
                    {entry.tags.length > 0 ? (
                      <span className="mt-1.5 block">
                        <TagList tags={entry.tags} small />
                      </span>
                    ) : null}
                  </span>
                  {covers.has(entry.id) ? (
                    <img
                      src={thumbnailUrl(covers.get(entry.id)!.publicId)}
                      alt=""
                      width={64}
                      height={64}
                      loading="lazy"
                      decoding="async"
                      className="size-16 shrink-0 rounded-md object-cover"
                    />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
