import Link from "next/link";

type TagListProps = {
  tags: { name: string; slug: string }[];
  /** When set, each tag links to the trip filtered on it. */
  tripSlug?: string;
  small?: boolean;
};

/** Tags shown on an entry, or in the list of a trip. */
export function TagList({ tags, tripSlug, small = false }: TagListProps) {
  if (tags.length === 0) return null;
  const look = `inline-flex items-center rounded-full border border-accent/30 bg-accent/10 text-accent ${small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag.slug}>
          {tripSlug ? (
            <Link href={`/trips/${tripSlug}?tags=${encodeURIComponent(tag.slug)}`} className={`${look} hover:bg-accent/20`}>
              {tag.name}
            </Link>
          ) : (
            <span className={look}>{tag.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
