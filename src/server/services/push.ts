import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { pushSubscriptions } from "@/server/db/schema";
import { canReceiveNotifications, type Actor } from "@/server/permissions";
import { takePendingPushMessages, type PushMessage } from "./notifications";

// Phone notifications (web push). A device is turned on from the profile page
// or the invitation shown in the installed app; each site notification is then
// also sent, encrypted, to the push service of the device's maker, which
// delivers it even when the application is closed.

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
export type StoredSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Push services of the browsers; the server never sends anything anywhere else. */
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];
const MAX_DEVICES_PER_USER = 20;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1000 || !URL.canParse(endpoint)) return false;
  const url = new URL(endpoint);
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  );
}

/** Checks what the browser sent, which is not trusted. */
export function parsePushSubscription(value: unknown): PushSubscriptionInput | null {
  if (typeof value !== "object" || value === null) return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  // A P-256 public key (65 bytes) and a 16-byte secret, in base64url.
  if (typeof p256dh !== "string" || !BASE64URL.test(p256dh) || p256dh.length < 86 || p256dh.length > 88) return null;
  if (typeof auth !== "string" || !BASE64URL.test(auth) || auth.length < 21 || auth.length > 24) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/**
 * Turns phone notifications on for one device of the actor, tied to the
 * session it is done in (logging out of it stops them). Saving the same device
 * again only refreshes it.
 */
export function savePushSubscription(
  db: Db,
  actor: Actor,
  sessionId: number | null,
  input: unknown,
  now = new Date(),
): { ok: true } | { ok: false; reason: "forbidden" | "invalid" } {
  if (!actor || sessionId === null || !canReceiveNotifications(actor)) return { ok: false, reason: "forbidden" };
  const subscription = parsePushSubscription(input);
  if (!subscription) return { ok: false, reason: "invalid" };
  const values = { userId: actor.id, sessionId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth };
  db.transaction((tx) => {
    tx.insert(pushSubscriptions)
      .values({ ...values, endpoint: subscription.endpoint, createdAt: now })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
      .run();
    // Old devices beyond the limit are forgotten, oldest first.
    const kept = tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, actor.id))
      .orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id))
      .all()
      .slice(-MAX_DEVICES_PER_USER)
      .map((row) => row.id);
    tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, actor.id), notInArray(pushSubscriptions.id, kept))).run();
  });
  return { ok: true };
}

/** Turns phone notifications off for one device of the actor. */
export function deletePushSubscription(db: Db, actor: Actor, endpoint: string): boolean {
  if (!actor || typeof endpoint !== "string") return false;
  return (
    db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, actor.id), eq(pushSubscriptions.endpoint, endpoint)))
      .run().changes > 0
  );
}

function subscriptionsOf(db: Db, userIds: number[]): Map<number, StoredSubscription[]> {
  const byUser = new Map<number, StoredSubscription[]>();
  if (userIds.length === 0) return byUser;
  for (const row of db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, [...new Set(userIds)])).all()) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } });
    byUser.set(row.userId, list);
  }
  return byUser;
}

/** Sends one encrypted message to one device; `gone` when the device no longer accepts any. */
export type PushSender = (subscription: StoredSubscription, payload: string) => Promise<{ gone: boolean }>;

/** What the service worker receives (public/sw.js). */
export type PushPayload = { title: string; body: string; url: string; tag: string; badge: number };

function payloadOf(message: Pick<PushMessage, "title" | "body" | "url" | "tag" | "unread">): string {
  const payload: PushPayload = { title: message.title, body: message.body, url: message.url, tag: message.tag, badge: message.unread };
  return JSON.stringify(payload);
}

async function sendAll(db: Db, send: PushSender, targets: { subscription: StoredSubscription; payload: string }[]) {
  let sent = 0;
  let removed = 0;
  await Promise.all(
    targets.map(async ({ subscription, payload }) => {
      try {
        const { gone } = await send(subscription, payload);
        if (gone) {
          // Application removed, or notifications refused in the phone's settings.
          db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint)).run();
          removed += 1;
        } else {
          sent += 1;
        }
      } catch {
        // Push service unreachable: this one is lost, the notification stays on the site.
      }
    }),
  );
  return { sent, removed };
}

/** Sends the notifications created since the last time to the devices of their recipients. */
export async function dispatchPendingPushes(db: Db, send: PushSender, now = new Date()): Promise<{ sent: number; removed: number }> {
  const messages = takePendingPushMessages(db, now);
  const devices = subscriptionsOf(db, messages.map((message) => message.recipientId));
  const targets = messages.flatMap((message) =>
    (devices.get(message.recipientId) ?? []).map((subscription) => ({ subscription, payload: payloadOf(message) })),
  );
  return sendAll(db, send, targets);
}

/** A test notification to one device of the actor, from the profile page. */
export async function sendTestPush(db: Db, actor: Actor, endpoint: string, send: PushSender): Promise<boolean> {
  if (!actor || !canReceiveNotifications(actor)) return false;
  const row = db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, actor.id), eq(pushSubscriptions.endpoint, endpoint)))
    .get();
  if (!row) return false;
  const payload = payloadOf({
    title: "RJ Around The World",
    body: "Les notifications fonctionnent sur cet appareil.",
    url: "/notifications",
    tag: "test",
    unread: -1,
  });
  const { sent } = await sendAll(db, send, [{ subscription: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload }]);
  return sent === 1;
}
