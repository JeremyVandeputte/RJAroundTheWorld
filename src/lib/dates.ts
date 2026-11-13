// Calendar days are handled as "YYYY-MM-DD" strings: no time, no timezone.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDay = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDay && year >= 1900 && year <= 2200 ? date : null;
}

export function isValidDateString(value: string): boolean {
  return toUtcDate(value) !== null;
}

const longFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-11-11" becomes "11 novembre 2026". */
export function formatDate(value: string): string {
  const date = toUtcDate(value);
  return date ? longFormat.format(date) : value;
}

/** "Du 1 novembre 2026 au 31 janvier 2027". */
export function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `Du ${formatDate(start)} au ${formatDate(end)}`;
}

const shortFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-11-14" becomes "sam. 14 nov.": compact, for filter buttons. */
export function formatShortDate(value: string): string {
  const date = toUtcDate(value);
  return date ? shortFormat.format(date) : value;
}
