// When the installed application invites to turn phone notifications on.
// Kept apart from the component so that the rule can be tested on its own.

/** Days before the invitation comes back after "Plus tard". */
export const INVITE_INTERVAL_DAYS = 7;
/** Times it is shown at most on a device: the first time and two reminders. */
export const MAX_INVITES = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the device remembers (localStorage). */
export type InviteRecord = { shown: number; lastAt: string; accepted: boolean };

export function parseInviteRecord(raw: string | null): InviteRecord | null {
  if (raw === null) return null;
  // First version: only the date it was shown, once.
  if (!raw.startsWith("{")) return Number.isNaN(Date.parse(raw)) ? null : { shown: 1, lastAt: raw, accepted: false };
  try {
    const value = JSON.parse(raw) as Partial<InviteRecord>;
    if (typeof value.shown !== "number" || typeof value.lastAt !== "string" || Number.isNaN(Date.parse(value.lastAt))) return null;
    return { shown: value.shown, lastAt: value.lastAt, accepted: value.accepted === true };
  } catch {
    return null;
  }
}

/** Whether to show the invitation now (the browser's own conditions are checked apart). */
export function shouldInvite(record: InviteRecord | null, now = new Date()): boolean {
  if (!record) return true;
  if (record.accepted || record.shown >= MAX_INVITES) return false;
  return now.getTime() - Date.parse(record.lastAt) >= INVITE_INTERVAL_DAYS * DAY_MS;
}

/** Record to keep once the invitation is shown, or once "Activer" is touched. */
export function nextInviteRecord(record: InviteRecord | null, event: "shown" | "accepted", now = new Date()): InviteRecord {
  if (event === "accepted") return { shown: record?.shown ?? 1, lastAt: record?.lastAt ?? now.toISOString(), accepted: true };
  return { shown: (record?.shown ?? 0) + 1, lastAt: now.toISOString(), accepted: false };
}
