import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { getDb } from "@/server/db/client";
import { loadEntry } from "@/server/page-data";
import { listEntryReaders } from "@/server/services/reads";

export const metadata: Metadata = { title: "Lectures de l'entrée" };

type ReadsPageProps = { params: Promise<{ tripSlug: string; entryId: string }> };

export default async function EntryReadsPage({ params }: ReadsPageProps) {
  const { tripSlug, entryId } = await params;
  const { viewer, trip, detail } = await loadEntry(tripSlug, entryId);
  // Only for the people who run the journal: everyone else gets a plain 404.
  const readers = trip && detail ? listEntryReaders(getDb(), viewer, trip, detail.entry) : null;
  if (!trip || !detail || !readers) notFound();
  const { entry } = detail;
  const total = readers.read.length + readers.unread.length;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href={`/trips/${trip.slug}/entries/${entry.id}`}
          className="text-sm text-accent underline-offset-4 hover:underline"
        >
          ← {entry.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Statistiques de lecture</h1>
        <p className="mt-1 text-muted">
          Lue par {readers.read.length} personne{readers.read.length > 1 ? "s" : ""} sur {total}. Écrite par{" "}
          {readers.author}, qui n&apos;est pas comptée.
        </p>
        {total > 0 ? (
          <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(readers.read.length / total) * 100}%` }} />
          </div>
        ) : null}
      </div>

      <section aria-labelledby="read-title">
        <h2 id="read-title" className="text-lg font-semibold">
          Ont lu ({readers.read.length})
        </h2>
        {readers.read.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Personne pour le moment.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-white">
            {readers.read.map((reader) => (
              <li key={reader.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5">
                <span className="font-medium">{reader.displayName}</span>
                <span className="text-sm text-muted">
                  <LocalDateTime iso={reader.readAt.toISOString()} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="unread-title">
        <h2 id="unread-title" className="text-lg font-semibold">
          N&apos;ont pas encore lu ({readers.unread.length})
        </h2>
        {readers.unread.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Tout le monde l&apos;a lue.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-white">
            {readers.unread.map((reader) => (
              <li key={reader.id} className="px-4 py-2.5 font-medium">
                {reader.displayName}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-muted">
        Une entrée compte comme lue dès que sa page a été ouverte. Seuls les comptes actifs qui peuvent voir ce voyage sont
        listés.
      </p>
    </div>
  );
}
