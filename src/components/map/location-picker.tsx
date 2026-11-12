"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import { TextField } from "@/components/ui/text-field";
import { createBaseMap, fitToPoints, loadLeaflet, pinIcon, type LatLng, type LeafletModule } from "./leaflet-setup";

type PointKey = "A" | "B";

type LocationPickerProps = {
  initialA: (LatLng & { name: string | null }) | null;
  initialB: (LatLng & { name: string | null }) | null;
  /** Places of the trip's other entries: where the map opens when this entry has none yet. */
  contextPoints: LatLng[];
};

/** Six decimals is about 10 cm: plenty, and it keeps the stored values short. */
const round = (value: number) => Math.round(value * 1e6) / 1e6;

const choice = "min-h-11 rounded-md border px-3 py-2 text-sm font-medium";
const selected = "border-accent bg-accent text-white";
const unselected = "border-line bg-white text-ink hover:bg-paper";

/**
 * Chooses the place of an entry by clicking on the map: one point for a
 * fixed place, or A then B for a one-way route. Markers can be dragged.
 * The coordinates travel with the form through hidden fields.
 */
export function LocationPicker({ initialA, initialB, contextPoints }: LocationPickerProps) {
  const [pointA, setPointA] = useState<LatLng | null>(initialA);
  const [pointB, setPointB] = useState<LatLng | null>(initialB);
  const [active, setActive] = useState<PointKey>("A");
  const [canLocate, setCanLocate] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const leaflet = useRef<{ L: LeafletModule; map: Leaflet.Map } | null>(null);
  const layers = useRef<Leaflet.Layer[]>([]);
  const [ready, setReady] = useState(false);
  // The map click handler is registered once: it reads the current choice from a ref.
  const activeRef = useRef(active);
  activeRef.current = active;
  const hasPointA = useRef(pointA !== null);
  hasPointA.current = pointA !== null;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;
    void loadLeaflet().then((L) => {
      if (cancelled || !container.current) return;
      map = createBaseMap(L, container.current, { scrollWheelZoom: false });
      const initial = [initialA, initialB].filter((point): point is NonNullable<typeof point> => point !== null);
      fitToPoints(map, initial.length > 0 ? initial : contextPoints);

      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        const point = { lat: round(event.latlng.lat), lng: round(event.latlng.lng) };
        // Point B only makes sense once A exists.
        if (activeRef.current === "B" && hasPointA.current) setPointB(point);
        else setPointA(point);
      });
      leaflet.current = { L, map };
      setReady(true);
    });
    // Geolocation only works over https (or on localhost).
    setCanLocate(window.isSecureContext && "geolocation" in navigator);
    return () => {
      cancelled = true;
      leaflet.current = null;
      map?.remove();
    };
    // Runs once: the initial values are only used to open the map.
  }, []);

  // Redraw markers and the line whenever a point changes.
  useEffect(() => {
    if (!ready || !leaflet.current) return;
    const { L, map } = leaflet.current;
    for (const layer of layers.current) layer.remove();
    layers.current = [];

    const addMarker = (point: LatLng, label: "" | "A" | "B", onMove: (point: LatLng) => void) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: pinIcon(L, label),
        draggable: true,
        title: label === "B" ? "Point B : faites glisser pour déplacer" : "Point A : faites glisser pour déplacer",
      }).addTo(map);
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        onMove({ lat: round(position.lat), lng: round(position.lng) });
      });
      layers.current.push(marker);
    };

    if (pointA && pointB) {
      const line = L.polyline(
        [
          [pointA.lat, pointA.lng],
          [pointB.lat, pointB.lng],
        ],
        { color: "#0f766e", weight: 3, opacity: 0.8 },
      ).addTo(map);
      layers.current.push(line);
    }
    if (pointA) addMarker(pointA, pointB ? "A" : "", setPointA);
    if (pointB) addMarker(pointB, "B", setPointB);
  }, [ready, pointA, pointB]);

  function clearAll() {
    setPointA(null);
    setPointB(null);
    setActive("A");
  }

  function removeB() {
    setPointB(null);
    setActive("A");
  }

  function locate() {
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => leaflet.current?.map.setView([position.coords.latitude, position.coords.longitude], 15),
      () => setLocateError("Position indisponible. Autorisez la localisation ou déplacez la carte à la main."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const hint = !pointA
    ? "Touchez la carte pour placer le lieu."
    : active === "B"
      ? "Touchez la carte pour placer l'arrivée (point B)."
      : "Touchez la carte ou faites glisser le marqueur pour déplacer le point A.";

  return (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-medium">Lieu</legend>
      <p className="mb-3 text-sm text-muted">
        Nécessaire pour publier. Un seul point pour un lieu fixe ; ajoutez un point B pour un trajet à sens unique de A
        vers B, par exemple une randonnée.
      </p>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Point à placer sur la carte">
        <button type="button" onClick={() => setActive("A")} aria-pressed={active === "A"} className={`${choice} ${active === "A" ? selected : unselected}`}>
          {pointA ? "Déplacer le point A" : "Placer le lieu"}
        </button>
        <button
          type="button"
          onClick={() => setActive("B")}
          aria-pressed={active === "B"}
          disabled={!pointA}
          className={`${choice} ${active === "B" ? selected : unselected} disabled:opacity-50`}
        >
          {pointB ? "Déplacer le point B" : "Ajouter une arrivée (point B)"}
        </button>
        {canLocate ? (
          <button type="button" onClick={locate} className={`${choice} ${unselected}`}>
            Centrer sur ma position
          </button>
        ) : null}
      </div>

      <div ref={container} className="isolate h-80 w-full overflow-hidden rounded-md border border-line bg-line" />
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        {hint}
      </p>
      {locateError ? (
        <p role="alert" className="mt-1 text-sm text-red-800">
          {locateError}
        </p>
      ) : null}

      {/* Sent with the form; empty values mean "no point". */}
      <input type="hidden" name="pointALat" value={pointA?.lat ?? ""} />
      <input type="hidden" name="pointALng" value={pointA?.lng ?? ""} />
      <input type="hidden" name="pointBLat" value={pointB?.lat ?? ""} />
      <input type="hidden" name="pointBLng" value={pointB?.lng ?? ""} />

      {pointA ? (
        <div className="mt-4 space-y-3">
          <TextField
            label={pointB ? "Nom du départ, point A (facultatif)" : "Nom du lieu (facultatif)"}
            name="pointAName"
            type="text"
            maxLength={100}
            defaultValue={initialA?.name ?? ""}
          />
          {pointB ? (
            <TextField
              label="Nom de l'arrivée, point B (facultatif)"
              name="pointBName"
              type="text"
              maxLength={100}
              defaultValue={initialB?.name ?? ""}
            />
          ) : null}
          <div className="flex flex-wrap gap-4 text-sm">
            {pointB ? (
              <button type="button" onClick={removeB} className="min-h-11 text-red-800">
                Retirer le point B
              </button>
            ) : null}
            <button type="button" onClick={clearAll} className="min-h-11 text-red-800">
              Effacer le lieu
            </button>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
