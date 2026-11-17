"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/ui/icons";
import { formatDate } from "@/lib/dates";
import { moveEntryAction } from "@/server/actions/entry-order";

export type OrderEntry = { id: number; title: string; authorName: string; isDraft: boolean; thumbnailUrl: string | null };
export type OrderDay = { date: string; entries: OrderEntry[] };
type Direction = "up" | "down";

const arrow =
  "grid size-11 place-items-center rounded-md border border-line bg-white text-accent hover:border-accent disabled:border-transparent disabled:bg-transparent disabled:text-line";

/**
 * The trip's entries, day by day, in the order of the journal. On days with
 * several entries, arrows move an entry up or down; each move is saved at once
 * and shown before the server has answered.
 */
export function EntryOrderEditor({ days }: { days: OrderDay[] }) {
  const [order, setOrder] = useState(days);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  // Button to focus once the moved entry is drawn at its new place.
  const focusAfterMove = useRef<{ id: number; direction: Direction } | null>(null);

  // The server's order replaces the local one once it has answered.
  const serverKey = days.map((day) => day.entries.map((entry) => entry.id).join(",")).join(";");
  useEffect(() => {
    setOrder(days);
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The arrow stays under the finger (or the keyboard), or the other one at the end of the day.
  useLayoutEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    const button = (direction: Direction) => document.getElementById(`move-${direction}-${target.id}`) as HTMLButtonElement | null;
    const same = button(target.direction);
    (same && !same.disabled ? same : button(target.direction === "up" ? "down" : "up"))?.focus();
  }, [order]);

  function move(dayIndex: number, index: number, direction: Direction) {
    if (isPending) return;
    const day = order[dayIndex]!;
    const otherIndex = direction === "up" ? index - 1 : index + 1;
    const entry = day.entries[index]!;
    if (!day.entries[otherIndex]) return;
    const entries = [...day.entries];
    [entries[index], entries[otherIndex]] = [entries[otherIndex]!, entries[index]!];
    const previous = order;
    focusAfterMove.current = { id: entry.id, direction };
    setOrder(order.map((item, i) => (i === dayIndex ? { ...item, entries } : item)));
    setError("");
    setMessage(`« ${entry.title} » est maintenant en position ${otherIndex + 1} sur ${entries.length} le ${formatDate(day.date)}.`);
    startTransition(async () => {
      let saved = false;
      try {
        saved = (await moveEntryAction(entry.id, direction)).ok;
      } catch {
        saved = false;
      }
      if (!saved) {
        setOrder(previous);
        setMessage("");
        setError("Le changement n'a pas pu être enregistré. Vérifiez la connexion et réessayez.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {order.map((day, dayIndex) => (
        <section key={day.date} aria-labelledby={`day-${day.date}`}>
          <h2 id={`day-${day.date}`} className="text-sm font-medium text-muted first-letter:uppercase">
            {formatDate(day.date)}
            {day.entries.length > 1 ? ` · ${day.entries.length} entrées` : ""}
          </h2>
          <ol className="mt-2 space-y-2">
            {day.entries.map((entry, index) => (
              <li key={entry.id} className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2">
                {day.entries.length > 1 ? (
                  <span aria-hidden="true" className="w-5 text-center text-sm font-semibold text-muted tabular-nums">
                    {index + 1}
                  </span>
                ) : null}
                {entry.thumbnailUrl ? (
                  <img src={entry.thumbnailUrl} alt="" width={48} height={48} loading="lazy" decoding="async" className="size-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <span aria-hidden="true" className="size-12 shrink-0 rounded-md bg-gradient-to-br from-accent/15 to-line" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold break-words">{entry.title}</span>
                    {entry.isDraft ? <Badge tone="warning">Brouillon</Badge> : null}
                  </span>
                  <span className="block text-sm text-muted">par {entry.authorName}</span>
                </span>
                {day.entries.length > 1 ? (
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      id={`move-up-${entry.id}`}
                      onClick={() => move(dayIndex, index, "up")}
                      disabled={index === 0}
                      aria-label={`Monter « ${entry.title} »`}
                      title="Monter"
                      className={arrow}
                    >
                      <ChevronUpIcon className="size-6" />
                    </button>
                    <button
                      type="button"
                      id={`move-down-${entry.id}`}
                      onClick={() => move(dayIndex, index, "down")}
                      disabled={index === day.entries.length - 1}
                      aria-label={`Descendre « ${entry.title} »`}
                      title="Descendre"
                      className={arrow}
                    >
                      <ChevronDownIcon className="size-6" />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
