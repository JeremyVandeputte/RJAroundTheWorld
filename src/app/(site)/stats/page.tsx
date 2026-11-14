import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getViewer } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { journalStats } from "@/server/services/stats";

export const metadata: Metadata = { title: "Statistiques" };

const number = new Intl.NumberFormat("fr-FR");
const km = (value: number) => `${number.format(Math.round(value))} km`;
const plural = (count: number, one: string, many: string) => `${number.format(count)} ${count > 1 ? many : one}`;

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse rounded-md border border-line bg-white px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

type RankingItem = { id: number; name: string; count: number };

/** Ranked list with thin bars: the number is always written, the bar only helps comparing. */
function Ranking({ id, title, items }: { id: string; title: string; items: RankingItem[] }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((item) => item.count));
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <ol className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate">{item.name}</span>
            <span className="text-sm text-muted tabular-nums">{plural(item.count, "entrée", "entrées")}</span>
            <span aria-hidden="true" className="col-span-2 block h-1.5 rounded-full bg-line">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(item.count / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function StatsPage() {
  const viewer = await getViewer();
  const stats = journalStats(getDb(), viewer);
  // Same answer as an unknown page for the people who may not see it.
  if (!stats) notFound();
  const { totals } = stats;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-accent underline-offset-4 hover:underline">
          ← Voyages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Statistiques</h1>
        <p className="mt-1 text-sm text-muted">Calculées sur les entrées publiées des voyages que vous pouvez voir.</p>
      </div>

      {totals.entries === 0 ? (
        <p className="text-muted">Aucune entrée publiée pour le moment.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile value={number.format(totals.trips)} label={totals.trips > 1 ? "voyages" : "voyage"} />
            <Tile value={number.format(totals.entries)} label={totals.entries > 1 ? "entrées" : "entrée"} />
            <Tile value={number.format(totals.days)} label={totals.days > 1 ? "jours racontés" : "jour raconté"} />
            <Tile value={number.format(totals.photos)} label={totals.photos > 1 ? "photos" : "photo"} />
            <Tile value={number.format(totals.videos)} label={totals.videos > 1 ? "vidéos" : "vidéo"} />
            {totals.routeKm > 0 ? <Tile value={km(totals.routeKm)} label="de trajets, à vol d'oiseau" /> : null}
          </dl>

          <section aria-labelledby="trips-title" className="space-y-2">
            <h2 id="trips-title" className="text-lg font-semibold">
              Par voyage
            </h2>
            <div className="overflow-x-auto rounded-md border border-line bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Voyage
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Entrées
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Jours
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Photos
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Vidéos
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Trajets
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {stats.trips.map((row) => (
                    <tr key={row.trip.id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        <Link href={`/trips/${row.trip.slug}`} className="text-accent underline-offset-4 hover:underline">
                          {row.trip.title}
                        </Link>
                        {!row.trip.isVisible ? (
                          <span className="ml-2">
                            <Badge tone="warning">Non visible</Badge>
                          </span>
                        ) : null}
                      </th>
                      <td className="px-3 py-2 text-right">{number.format(row.entries)}</td>
                      <td className="px-3 py-2 text-right">{number.format(row.days)}</td>
                      <td className="px-3 py-2 text-right">{number.format(row.photos)}</td>
                      <td className="px-3 py-2 text-right">{number.format(row.videos)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{row.routeKm > 0 ? km(row.routeKm) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-8 sm:grid-cols-2">
            <Ranking id="ranking-tags" title="Tags les plus utilisés" items={stats.tags} />
            <Ranking
              id="ranking-people"
              title="Personnes les plus présentes"
              items={stats.people.map((person) => ({ id: person.id, name: person.displayName, count: person.count }))}
            />
            <Ranking
              id="ranking-authors"
              title="Entrées écrites"
              items={stats.authors.map((author) => ({ id: author.id, name: author.displayName, count: author.count }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
