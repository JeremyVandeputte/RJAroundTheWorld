"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronDownIcon, CloseIcon, FilterIcon } from "@/components/ui/icons";
import { formatDate, formatShortDate } from "@/lib/dates";
import { filtersToQuery, hasActiveFilters, type TripFilters } from "@/lib/trip-filters";
import { DayCalendar } from "./day-calendar";

type TripFiltersFormProps = {
  /** Page the filters apply to (journal or map of the trip). */
  basePath: string;
  days: string[];
  tags: { name: string; slug: string }[];
  filters: TripFilters;
};

const pill =
  "inline-flex min-h-9 shrink-0 cursor-pointer items-center rounded-full border px-3 text-sm whitespace-nowrap has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40";
const pillOn = "border-accent bg-accent text-white";
const pillOff = "border-line bg-white text-ink hover:border-accent";

/**
 * Filters by day (a calendar) and by tags: a bar that opens a panel, and the
 * active filters shown as chips that remove themselves when touched. A
 * plain GET form (works without JavaScript); with JavaScript, every change
 * is applied at once and the panel stays open while choosing.
 */
export function TripFiltersForm({ basePath, days, tags, filters }: TripFiltersFormProps) {
  const router = useRouter();
  // Shown at once when touched, before the page has caught up.
  const [current, setCurrent] = useState(filters);
  const [open, setOpen] = useState(false);
  const query = filtersToQuery(filters);
  // Follow the address (back button, links): compared as text, not as an object.
  useEffect(() => {
    setCurrent(filters);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  if (days.length === 0 && tags.length === 0) return null;

  const active = hasActiveFilters(current);
  const count = (current.date ? 1 : 0) + current.tagSlugs.length;
  const tagName = (slug: string) => tags.find((tag) => tag.slug === slug)?.name ?? slug;

  function apply(next: TripFilters) {
    setCurrent(next);
    router.replace(`${basePath}${filtersToQuery(next)}`, { scroll: false });
  }

  function toggleTag(slug: string) {
    const tagSlugs = current.tagSlugs.includes(slug)
      ? current.tagSlugs.filter((item) => item !== slug)
      : [...current.tagSlugs, slug];
    apply({ ...current, tagSlugs });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  // Address of the page without one of the active filters (works without JavaScript).
  const without = (next: TripFilters) => `${basePath}${filtersToQuery(next)}`;

  return (
    <div className="space-y-2">
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group rounded-md border border-line bg-white open:shadow-sm"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-md px-4 py-2 font-medium hover:bg-paper [&::-webkit-details-marker]:hidden">
          <FilterIcon className="size-5 text-accent" />
          <span className="flex-1">
            Filtrer par jour ou par tag
            {count > 0 ? (
              <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs leading-6 font-semibold text-white">
                <span className="sr-only">filtres actifs : </span>
                {count}
              </span>
            ) : null}
          </span>
          <ChevronDownIcon className="size-5 text-muted transition-transform group-open:rotate-180" />
        </summary>

        <form method="get" action={basePath} onSubmit={onSubmit} className="space-y-4 border-t border-line px-4 py-3">
          {days.length > 0 ? (
            // min-w-0: a fieldset is as wide as its content by default, which widened the page.
            <fieldset className="min-w-0">
              <legend className="text-sm font-medium">Jour</legend>
              <DayCalendar
                days={days}
                selected={current.date}
                onSelect={(date) => apply({ ...current, date })}
                pillClassName={(isChecked) => `${pill} ${isChecked ? pillOn : pillOff}`}
              />
            </fieldset>
          ) : null}

          {tags.length > 0 ? (
            <fieldset className="min-w-0">
              <legend className="text-sm font-medium">Tags</legend>
              <p className="text-sm text-muted">Les entrées qui ont au moins un des tags choisis.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isChecked = current.tagSlugs.includes(tag.slug);
                  return (
                    <label key={tag.slug} className={`${pill} ${isChecked ? pillOn : pillOff}`}>
                      <input
                        type="checkbox"
                        name="tags"
                        value={tag.slug}
                        checked={isChecked}
                        onChange={() => toggleTag(tag.slug)}
                        className="sr-only"
                      />
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

      {active ? (
        <ul aria-label="Filtres actifs" className="flex flex-wrap items-center gap-2">
          {current.date ? (
            <li>
              <ActiveChip href={without({ ...current, date: null })} label={`Retirer le filtre ${formatDate(current.date)}`} onRemove={() => apply({ ...current, date: null })}>
                {formatShortDate(current.date)}
              </ActiveChip>
            </li>
          ) : null}
          {current.tagSlugs.map((slug) => (
            <li key={slug}>
              <ActiveChip
                href={without({ ...current, tagSlugs: current.tagSlugs.filter((item) => item !== slug) })}
                label={`Retirer le tag ${tagName(slug)}`}
                onRemove={() => toggleTag(slug)}
              >
                {tagName(slug)}
              </ActiveChip>
            </li>
          ))}
          <li>
            <Link
              href={basePath}
              scroll={false}
              onClick={() => setCurrent({ date: null, tagSlugs: [] })}
              className="inline-flex min-h-9 items-center px-1 text-sm text-accent underline-offset-4 hover:underline"
            >
              Tout effacer
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** An active filter: touching it removes it. */
function ActiveChip({ href, label, onRemove, children }: { href: string; label: string; onRemove: () => void; children: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      replace
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        onRemove();
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent/10 py-1 pr-2 pl-3 text-sm font-medium text-accent hover:bg-accent/20"
    >
      {children}
      <CloseIcon className="size-4" />
    </Link>
  );
}
