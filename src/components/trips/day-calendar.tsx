"use client";

import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { addMonths, formatMonth, monthOf, monthsBetween, monthWeeks } from "@/lib/calendar";
import { formatDate } from "@/lib/dates";

type DayCalendarProps = {
  /** Days that have at least one entry (any order). */
  days: string[];
  selected: string | null;
  onSelect: (day: string | null) => void;
  /** Look of the "Tous les jours" button, shared with the tag buttons. */
  pillClassName: (isChecked: boolean) => string;
};

const WEEKDAYS = [
  ["L", "lundi"],
  ["M", "mardi"],
  ["M", "mercredi"],
  ["J", "jeudi"],
  ["V", "vendredi"],
  ["S", "samedi"],
  ["D", "dimanche"],
] as const;

const monthButton = "grid size-10 place-items-center rounded-full text-accent hover:bg-accent/10 disabled:invisible";

/**
 * The day filter as a calendar, one month at a time, from the month of the first
 * entry to the month of the last one. Days with entries are marked and can be
 * chosen; the others are greyed out. Radio buttons named "jour", so it also works
 * as a plain form without JavaScript (all months are then shown one under another).
 */
export function DayCalendar({ days, selected, onSelect, pillClassName }: DayCalendarProps) {
  const sorted = [...new Set(days)].sort();
  const withEntries = new Set(sorted);
  const months = monthsBetween(monthOf(sorted[0]!), monthOf(sorted.at(-1)!));
  const startMonth = (day: string | null) => {
    const month = day ? monthOf(day) : null;
    // The chosen day's month, or else the most recent one, as the journal starts with it.
    return month && months.includes(month) ? month : months.at(-1)!;
  };
  const [shown, setShown] = useState(() => startMonth(selected));
  // Before JavaScript runs, every month is shown and there is nothing to page through.
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  // A day chosen elsewhere (back button, link) brings its month.
  useEffect(() => {
    if (selected) setShown(startMonth(selected));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-2 space-y-3">
      <label className={pillClassName(selected === null)}>
        <input type="radio" name="jour" value="" checked={selected === null} onChange={() => onSelect(null)} className="sr-only" />
        Tous les jours
      </label>

      {months.map((month) => (
        <div key={month} hidden={interactive && month !== shown} className="max-w-sm">
          <div className="flex items-center justify-between">
            {interactive ? (
              <button type="button" onClick={() => setShown(addMonths(month, -1))} disabled={month === months[0]} aria-label="Mois précédent" className={monthButton}>
                <ChevronLeftIcon />
              </button>
            ) : null}
            <p aria-live="polite" className="flex-1 text-center font-medium first-letter:uppercase">
              {formatMonth(month)}
            </p>
            {interactive ? (
              <button type="button" onClick={() => setShown(addMonths(month, 1))} disabled={month === months.at(-1)} aria-label="Mois suivant" className={monthButton}>
                <ChevronRightIcon />
              </button>
            ) : null}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
            {WEEKDAYS.map(([letter, name]) => (
              <abbr key={name} title={name} className="py-1 text-xs font-medium text-muted no-underline">
                {letter}
              </abbr>
            ))}
            {monthWeeks(month)
              .flat()
              .map((day, index) => {
                if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
                const number = Number(day.slice(8));
                if (!withEntries.has(day)) {
                  return (
                    <span key={day} aria-hidden="true" className="grid aspect-square place-items-center text-muted/50">
                      {number}
                    </span>
                  );
                }
                const isChecked = selected === day;
                return (
                  <label
                    key={day}
                    title={formatDate(day)}
                    className={`relative grid aspect-square cursor-pointer place-items-center rounded-full font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                      isChecked ? "bg-accent text-white" : "bg-accent/10 text-accent hover:bg-accent/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="jour"
                      value={day}
                      checked={isChecked}
                      onChange={() => onSelect(day)}
                      // Touching the chosen day again shows every day.
                      onClick={() => {
                        if (isChecked) onSelect(null);
                      }}
                      className="sr-only"
                    />
                    <span className="sr-only">{formatDate(day)}</span>
                    <span aria-hidden="true">{number}</span>
                    <span aria-hidden="true" className={`absolute bottom-1 size-1 rounded-full ${isChecked ? "bg-white" : "bg-accent"}`} />
                  </label>
                );
              })}
          </div>
        </div>
      ))}

      <p className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden="true" className="inline-grid size-5 place-items-center rounded-full bg-accent/10">
          <span className="size-1 rounded-full bg-accent" />
        </span>
        Jour avec au moins une entrée
      </p>
    </div>
  );
}
