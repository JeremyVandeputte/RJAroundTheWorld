// Month grids for the day filter. Months are "YYYY-MM" strings, days "YYYY-MM-DD".

/** "2026-11-14" becomes "2026-11". */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** The month `count` months after (or before, when negative) the given one. */
export function addMonths(month: string, count: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every month from the first to the last, both included, in order. */
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (let month = first; month <= last && months.length < 1200; month = addMonths(month, 1)) months.push(month);
  return months;
}

/**
 * The weeks of a month, Monday first, as in France: each week has 7 cells,
 * the day ("YYYY-MM-DD") or null for the days of the neighbouring months.
 */
export function monthWeeks(month: string): (string | null)[][] {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year!, monthNumber! - 1, 1));
  const length = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  // getUTCDay: 0 is Sunday; shifted so that Monday is 0.
  const offset = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= length; day++) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-11" becomes "novembre 2026". */
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthFormat.format(new Date(Date.UTC(year!, monthNumber! - 1, 1)));
}
