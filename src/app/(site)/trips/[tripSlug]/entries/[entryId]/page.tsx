import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MediaGallery } from "@/components/entry/media-gallery";
import { RichText } from "@/components/entry/rich-text";
import { TripMap } from "@/components/map/trip-map";
import { TagList } from "@/components/tags/tag-list";
import { SocialSection } from "@/components/social/social-section";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { formatDate } from "@/lib/dates";
import { getDb } from "@/server/db/client";
import { loadEntry } from "@/server/page-data";
import { canEditEntry } from "@/server/permissions";
import { listEntryMedia } from "@/server/services/media";

type EntryPageProps = { params: Promise<{ tripSlug: string; entryId: string }> };

export async function generateMetadata({ params }: EntryPageProps): Promise<Metadata> {
  const { tripSlug, entryId } = await params;
  const { detail } = await loadEntry(tripSlug, entryId);
  return detail ? { title: detail.entry.title } : {};
}

function placeLabel(name: string | null, fallback: string): string {
  return name?.trim() || fallback;
}

export default async function EntryPage({ params }: EntryPageProps) {
  const { tripSlug, entryId } = await params;
  const { viewer, trip, detail } = await loadEntry(tripSlug, entryId);
  if (!trip || !detail) notFound();
  const { entry, author, people } = detail;

  const hasPointA = entry.pointALat !== null;
  const hasPointB = entry.pointBLat !== null;

  return (
    <article className="space-y-6">
      <header>
        <Link href={`/trips/${trip.slug}`} className="text-sm text-accent underline-offset-4 hover:underline">
          ← {trip.title}
        </Link>
        <p className="mt-3 text-sm text-muted">{formatDate(entry.date)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{entry.title}</h1>
          {entry.status === "draft" ? <Badge tone="warning">Brouillon</Badge> : null}
          {!trip.isVisible ? <Badge tone="warning">Voyage non visible</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">par {author.displayName}</p>
        {hasPointA ? (
          <p className="mt-1 text-sm text-muted">
            {hasPointB
              ? `Trajet : ${placeLabel(entry.pointAName, "point A")} → ${placeLabel(entry.pointBName, "point B")}`
              : `Lieu : ${placeLabel(entry.pointAName, "indiqué sur la carte")}`}
          </p>
        ) : null}
        {people.length > 0 ? (
          <p className="mt-1 text-sm text-muted">Avec {people.map((person) => person.displayName).join(", ")}</p>
        ) : null}
        {detail.tags.length > 0 ? (
          <div className="mt-3">
            <TagList tags={detail.tags} tripSlug={trip.slug} />
          </div>
        ) : null}
      </header>

      {entry.body ? <RichText source={entry.body} /> : null}

      <MediaGallery items={listEntryMedia(getDb(), viewer, trip, entry)} />

      {entry.pointALat !== null && entry.pointALng !== null ? (
        <TripMap
          className="h-64"
          scrollWheelZoom={false}
          entries={[
            {
              id: entry.id,
              title: entry.title,
              pointA: { lat: entry.pointALat, lng: entry.pointALng, name: entry.pointAName },
              pointB:
                entry.pointBLat !== null && entry.pointBLng !== null
                  ? { lat: entry.pointBLat, lng: entry.pointBLng, name: entry.pointBName }
                  : null,
            },
          ]}
        />
      ) : null}

      <SocialSection db={getDb()} viewer={viewer} trip={trip} entry={entry} />

      {canEditEntry(viewer, trip, entry) ? (
        <div className="border-t border-line pt-4">
          <LinkButton href={`/trips/${trip.slug}/entries/${entry.id}/edit`}>Modifier l&apos;entrée</LinkButton>
        </div>
      ) : null}
    </article>
  );
}
