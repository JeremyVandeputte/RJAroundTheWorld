// Colours telling trips apart on the map of all trips. All of them keep
// white marker labels readable (contrast of at least 4.5:1).
export const TRIP_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#be185d", "#6d28d9", "#4d7c0f", "#b91c1c", "#0e7490"] as const;

/** Colour of the trip at this position in the list; colours repeat after eight trips. */
export function tripColor(index: number): string {
  return TRIP_COLORS[index % TRIP_COLORS.length]!;
}
