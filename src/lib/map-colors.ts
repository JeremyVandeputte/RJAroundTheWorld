// Colours telling trips apart on the map of all trips: a categorical palette
// checked for colour-blind readers (adjacent colours stay distinguishable in
// the given order). Each colour comes with the letter colour ("A", "B")
// that reads best on it. Trips are also named in the legend and in each
// marker's tooltip, so the colour is never the only clue.
export type TripColor = { fill: string; label: string };

const INK = "#1f2933";
const WHITE = "#ffffff";

export const TRIP_COLORS: readonly TripColor[] = [
  { fill: "#2a78d6", label: WHITE }, // blue
  { fill: "#eb6834", label: INK }, // orange
  { fill: "#1baf7a", label: INK }, // aqua
  { fill: "#eda100", label: INK }, // yellow
  { fill: "#e87ba4", label: INK }, // magenta
  { fill: "#008300", label: WHITE }, // green
  { fill: "#6250d6", label: WHITE }, // violet
  { fill: "#e34948", label: WHITE }, // red
];

/** Colour of the trip at this position (oldest trip first); colours repeat after eight trips. */
export function tripColor(index: number): TripColor {
  return TRIP_COLORS[index % TRIP_COLORS.length]!;
}
