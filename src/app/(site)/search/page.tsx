import type { Metadata } from "next";
import Link from "next/link";
import { Highlighted } from "@/components/search/highlighted";
import { SearchForm } from "@/components/search/search-form";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { getViewer } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { MAX_SEARCH_RESULTS, searchEntries } from "@/server/services/search";

export const metadata: Metadata = { title: "Recherche" };

type SearchPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const viewer = await getViewer();
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const { terms, total, results } = searchEntries(getDb(), viewer, query);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-accent underline-offset-4 hover:underline">
          ← Voyages
        </Link>
        <h1 className="mt-2 mb-4 text-2xl font-semibold tracking-tight">Recherche</h1>
        <SearchForm query={query} autoFocus={query === ""} />
        <p className="mt-2 text-sm text-muted">
          Dans les titres, les textes, les lieux, les tags, les voyages et les personnes. Les accents et les majuscules
          sont ignorés ; tous les mots doivent être présents.
        </p>
      </div>

      {terms.length === 0 ? null : total === 0 ? (
        <p className="text-muted">Aucune entrée ne correspond à cette recherche.</p>
      ) : (
        <section aria-labelledby="results-title" className="space-y-3">
          <h2 id="results-title" className="text-lg font-semibold">
            {total} résultat{total > 1 ? "s" : ""}
            {total > MAX_SEARCH_RESULTS ? (
              <span className="text-sm font-normal text-muted"> ({MAX_SEARCH_RESULTS} plus récents affichés)</span>
            ) : null}
          </h2>
          <ul className="space-y-3">
            {results.map((result) => (
              <li key={result.entryId}>
                <Link
                  href={`/trips/${result.tripSlug}/entries/${result.entryId}`}
                  className="block rounded-md border border-line bg-white px-4 py-3 hover:border-accent/50"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      <Highlighted segments={result.title} />
                    </span>
                    {result.status === "draft" ? <Badge tone="warning">Brouillon</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {result.tripTitle} · {formatDate(result.date)}
                  </span>
                  {result.excerpt.length > 0 ? (
                    <span className="mt-2 block text-sm">
                      <Highlighted segments={result.excerpt} />
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
