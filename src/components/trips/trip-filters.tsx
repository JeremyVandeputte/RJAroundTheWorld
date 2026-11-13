"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { formatDate } from "@/lib/dates";
import { filtersToQuery, hasActiveFilters, type TripFilters } from "@/lib/trip-filters";

type TripFiltersFormProps = {
  /** Page the filters apply to (journal or map of the trip). */
  basePath: string;
  days: string[];
  tags: { name: string; slug: string }[];
  filters: TripFilters;
};

const chip =
  "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40";

/**
 * Filters by day and by tags. A plain GET form (works without JavaScript);
 * with JavaScript, every change is applied at once.
 */
export function TripFiltersForm({ basePath, days, tags, filters }: TripFiltersFormProps) {
  const router = useRouter();
  const active = hasActiveFilters(filters);
  const count = (filters.date ? 1 : 0) + filters.tagSlugs.length;

  function apply(form: HTMLFormElement) {
    const data = new FormData(form);
    const date = data.get("jour");
    const next: TripFilters = {
      date: typeof date === "string" && date ? date : null,
      tagSlugs: data.getAll("tags").filter((value): value is string => typeof value === "string"),
    };
    router.replace(`${basePath}${filtersToQuery(next)}`, { scroll: false });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(event.currentTarget);
  }

  if (days.length === 0 && tags.length === 0) return null;

  return (
    <details open={active} className="rounded-md border border-line bg-white">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 font-medium">
        <span>Filtrer{active ? ` (${count})` : ""}</span>
        {active ? (
          <Link href={basePath} scroll={false} className="text-sm font-normal text-accent underline-offset-4 hover:underline">
            Effacer les filtres
          </Link>
        ) : null}
      </summary>
      <form
        method="get"
        action={basePath}
        onSubmit={onSubmit}
        onChange={(event) => apply(event.currentTarget)}
        className="space-y-4 border-t border-line px-4 py-3"
      >
        {days.length > 0 ? (
          <div>
            <label htmlFor="filter-day" className="block text-sm font-medium">
              Jour
            </label>
            <select
              id="filter-day"
              name="jour"
              defaultValue={filters.date ?? ""}
              className="mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-base"
            >
              <option value="">Tous les jours</option>
              {days.map((day) => (
                <option key={day} value={day}>
                  {formatDate(day)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {tags.length > 0 ? (
          <fieldset>
            <legend className="text-sm font-medium">Tags</legend>
            <p className="text-sm text-muted">Les entrées qui ont au moins un des tags choisis.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isChecked = filters.tagSlugs.includes(tag.slug);
                return (
                  <label
                    key={tag.slug}
                    className={`${chip} has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-white ${isChecked ? "" : "border-line bg-white text-ink hover:border-accent"}`}
                  >
                    <input type="checkbox" name="tags" value={tag.slug} defaultChecked={isChecked} className="sr-only" />
                    {tag.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {/* Without JavaScript the form is sent with this button. */}
        <noscript>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-md border border-line bg-white px-4 font-medium">
            Appliquer
          </button>
        </noscript>
      </form>
    </details>
  );
}
