import Link from "next/link";
import { formatDate } from "@/lib/dates";

type Neighbour = { id: number; title: string; date: string };

type EntryPagerProps = {
  /** Address of an entry, keeping the journal's filters. */
  hrefOf: (entryId: number) => string;
  previous: Neighbour | null;
  next: Neighbour | null;
};

const card =
  "flex min-h-11 flex-col rounded-md border border-line bg-white px-4 py-3 hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none";

/** Links to the entries before and after this one, in the order of the trip's days. */
export function EntryPager({ hrefOf, previous, next }: EntryPagerProps) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Entrées précédente et suivante" className="grid grid-cols-2 gap-3">
      {previous ? (
        <Link href={hrefOf(previous.id)} rel="prev" className={card}>
          <span className="text-sm text-accent">← Précédente</span>
          <span className="mt-0.5 line-clamp-2 font-medium">{previous.title}</span>
          <span className="text-xs text-muted">{formatDate(previous.date)}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {next ? (
        <Link href={hrefOf(next.id)} rel="next" className={`${card} items-end text-right`}>
          <span className="text-sm text-accent">Suivante →</span>
          <span className="mt-0.5 line-clamp-2 font-medium">{next.title}</span>
          <span className="text-xs text-muted">{formatDate(next.date)}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
