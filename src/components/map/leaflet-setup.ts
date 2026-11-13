import type * as Leaflet from "leaflet";

export type LeafletModule = typeof Leaflet;
export type LatLng = { lat: number; lng: number };

/**
 * Leaflet needs the browser (`window`), so it is loaded on demand from
 * effects, never during server rendering. It is bundled with the site:
 * nothing is fetched from a CDN.
 */
export async function loadLeaflet(): Promise<LeafletModule> {
  const loaded = (await import("leaflet")) as LeafletModule & { default?: LeafletModule };
  return loaded.default ?? loaded;
}

/**
 * Map with OpenStreetMap tiles: the only third-party request of the site.
 * OpenStreetMap receives the tile coordinates and the site's domain, never
 * the address of the page (see Referrer-Policy in next.config.ts).
 */
export function createBaseMap(L: LeafletModule, element: HTMLElement, options: Leaflet.MapOptions = {}): Leaflet.Map {
  const map = L.map(element, { worldCopyJump: true, ...options });
  // Plain credit, without the decoration Leaflet adds by default.
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

/**
 * Round marker, optionally labelled "A" or "B", optionally in a trip's colour
 * (a hexadecimal colour from TRIP_COLORS). Neither is ever user input.
 */
export function pinIcon(L: LeafletModule, label: "" | "A" | "B", color?: string): Leaflet.DivIcon {
  const style = color && /^#[0-9a-f]{6}$/i.test(color) ? ` style="background-color:${color}"` : "";
  return L.divIcon({
    className: "",
    html: `<span class="map-pin${label === "B" ? " map-pin--end" : ""}"${style}>${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const WORLD_VIEW = { center: [20, 0] as [number, number], zoom: 2 };

/** Shows all the given points, or the whole world when there are none. */
export function fitToPoints(map: Leaflet.Map, points: LatLng[]): void {
  const first = points[0];
  if (!first) {
    map.setView(WORLD_VIEW.center, WORLD_VIEW.zoom);
  } else if (points.length === 1) {
    map.setView([first.lat, first.lng], 13);
  } else {
    map.fitBounds(
      points.map((point) => [point.lat, point.lng] as [number, number]),
      { padding: [32, 32], maxZoom: 15 },
    );
  }
}
