/**
 * Where a photo was taken, read from its GPS data when it was sent. Only
 * shown to people who can edit the entry, to place it on the map; the files
 * themselves are served without any GPS data.
 */
export type PhotoPosition = {
  publicId: string;
  lat: number;
  lng: number;
  /** Capture time as written by the camera ("2026-07-14T09:30:00"), if known. */
  takenAt: string | null;
};

/**
 * Oldest first; photos without a capture time after the others. Array sorting
 * is stable, so photos with the same time keep their order.
 */
export function compareCaptureTime(a: PhotoPosition, b: PhotoPosition): number {
  if (a.takenAt && b.takenAt) return a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0;
  return a.takenAt ? -1 : b.takenAt ? 1 : 0;
}
