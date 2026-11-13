"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createBaseMap, fitToPoints, loadLeaflet, pinIcon, type LatLng } from "./leaflet-setup";

export type TripMapEntry = {
  id: number;
  title: string;
  pointA: LatLng & { name: string | null };
  pointB: (LatLng & { name: string | null }) | null;
  /** Page of the entry; otherwise `${entryLinkBase}${id}`. */
  href?: string;
  /** Colour of its trip, on the map of all trips. */
  color?: string;
  /** Shown before the entry title in the marker tooltip (the trip, on the map of all trips). */
  context?: string;
};

type TripMapProps = {
  entries: TripMapEntry[];
  /** When set, clicking a marker opens `${entryLinkBase}${entry.id}`. */
  entryLinkBase?: string;
  /** Tailwind classes giving the map its height. */
  className?: string;
  /** Zooming with the mouse wheel; off for small maps embedded in a page. */
  scrollWheelZoom?: boolean;
};

/**
 * Markers of journal entries: one point for a place, or A and B joined by a
 * straight line for a one-way route (no route calculation).
 */
export function TripMap({ entries, entryLinkBase, className = "h-80", scrollWheelZoom = true }: TripMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let map: Leaflet.Map | undefined;
    let cancelled = false;

    void loadLeaflet().then((L) => {
      if (cancelled || !container.current) return;
      map = createBaseMap(L, container.current, { scrollWheelZoom });
      const shown: LatLng[] = [];

      for (const entry of entries) {
        const href = entry.href ?? (entryLinkBase ? `${entryLinkBase}${entry.id}` : undefined);
        const open = href ? () => router.push(href) : undefined;
        const title = entry.context ? `${entry.context} · ${entry.title}` : entry.title;
        const addMarker = (point: LatLng & { name: string | null }, label: "" | "A" | "B") => {
          // `title` is set as an attribute, so entry titles are never parsed as HTML.
          const marker = L.marker([point.lat, point.lng], {
            icon: pinIcon(L, label, entry.color),
            title: point.name ? `${title} · ${point.name}` : title,
            keyboard: true,
          }).addTo(map!);
          if (open) marker.on("click", open);
          shown.push(point);
        };

        if (entry.pointB) {
          L.polyline(
            [
              [entry.pointA.lat, entry.pointA.lng],
              [entry.pointB.lat, entry.pointB.lng],
            ],
            { color: entry.color ?? "#0f766e", weight: 3, opacity: 0.8 },
          ).addTo(map);
          addMarker(entry.pointA, "A");
          addMarker(entry.pointB, "B");
        } else {
          addMarker(entry.pointA, "");
        }
      }
      fitToPoints(map, shown);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [entries, entryLinkBase, router, scrollWheelZoom]);

  return <div ref={container} className={`isolate w-full overflow-hidden rounded-md border border-line bg-line ${className}`} />;
}
