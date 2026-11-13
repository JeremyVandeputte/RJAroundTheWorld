"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { compareCaptureTime, type PhotoPosition } from "@/lib/photo-position";

type PhotoPositionsContext = {
  positions: PhotoPosition[];
  add: (position: PhotoPosition) => void;
  remove: (publicId: string) => void;
};

const Context = createContext<PhotoPositionsContext | null>(null);

/**
 * GPS positions of an entry's photos, shared between the photo manager (which
 * adds and removes photos) and the place picker (which offers them).
 */
export function PhotoPositionsProvider({ initial, children }: { initial: PhotoPosition[]; children: ReactNode }) {
  const [positions, setPositions] = useState(initial);
  const value = useMemo<PhotoPositionsContext>(
    () => ({
      positions,
      add: (position) =>
        setPositions((current) =>
          current.some((item) => item.publicId === position.publicId) ? current : [...current, position].sort(compareCaptureTime),
        ),
      remove: (publicId) => setPositions((current) => current.filter((item) => item.publicId !== publicId)),
    }),
    [positions],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Null outside a provider (new entry: no photos yet). */
export function usePhotoPositions(): PhotoPositionsContext | null {
  return useContext(Context);
}
