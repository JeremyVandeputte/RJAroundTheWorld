import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkAsRead } from "@/components/entry/mark-as-read";
import { MediaGallery } from "@/components/entry/media-gallery";
import { RichText } from "@/components/entry/rich-text";
import { TripMap } from "@/components/map/trip-map";
import { TagList } from "@/components/tags/tag-list";
import { Badge } from "@/components/ui/badge";
import { ChartIcon, MapPinIcon, PencilIcon, RouteIcon, UsersIcon } from "@/components/ui/icons";
import { LinkButton } from "@/components/ui/link-button";
import { formatDate } from "@/lib/dates";
import { getDb } from "@/server/db/client";
import { loadEntry } from "@/server/page-data";
import { canEditEntry, canManageJournal } from "@/server/permissions";
import { listEntryMedia } from "@/server/services/media";

type EntryPageProps = { params: Promise<{ tripSlug: string; entryId: string }> };

export async function generateMetadata({ params }: EntryPageProps): Promise<Metadata> {
  const { tripSlug, entryId } = await params;
  const { detail } = await loadEntry(tripSlug, entryId);
  return detail ? { title: detail.entry.title } : {};
}

const fact = "mt-1.5 flex items-start gap-2 text-sm text-muted";
const factIcon = "mt-px size-[18px] text-accent";

function placeLabel(name: string | null, fallback: string): string {
  return name?.trim() || fallback;
}

export default async function EntryPage({ params }: EntryPageProps) {
  const { tripSlug, entryId } = await params;
  const { viewer, trip, detail } = await loadEntry(tripSlug, entryId);
  if (!trip || !detail) notFound();
  const { entry, author, people } = detail;

  const canEdit = canEditEntry(viewer, trip, entry);
  // Who read it: for the people who run the journal, once published.
  const showReads = canManageJournal(viewer) && entry.status === "published";
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
          <p className={fact}>
            {hasPointB ? <RouteIcon className={factIcon} /> : <MapPinIcon className={factIcon} />}
            <span>
              {/* The icon says it on screen; screen readers get the word. */}
              <span className="sr-only">{hasPointB ? "Trajet : " : "Lieu : "}</span>
              {hasPointB
                ? `${placeLabel(entry.pointAName, "point A")} → ${placeLabel(entry.pointBName, "point B")}`
                : placeLabel(entry.pointAName, "indiqué sur la carte")}
            </span>
          </p>
        ) : null}
        {people.length > 0 ? (
          <p className={fact}>
            <UsersIcon className={factIcon} />
            <span>
              <span className="sr-only">Avec </span>
              {people.map((person) => person.displayName).join(", ")}
            </span>
          </p>
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

      <MarkAsRead entryId={entry.id} />

      {canEdit || showReads ? (
        <div className="flex flex-wrap gap-3 border-t border-line pt-4">
          {canEdit ? (
            <LinkButton href={`/trips/${trip.slug}/entries/${entry.id}/edit`}>
              <PencilIcon className="mr-2 size-5 text-accent" />
              Modifier l&apos;entrée
            </LinkButton>
          ) : null}
          {showReads ? (
            <LinkButton href={`/trips/${trip.slug}/entries/${entry.id}/reads`}>
              <ChartIcon className="mr-2 size-5 text-accent" />
              Statistiques
            </LinkButton>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
