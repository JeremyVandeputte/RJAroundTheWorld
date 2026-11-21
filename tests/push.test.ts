import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { createSession } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { notifications, pushSubscriptions, sessions, users } from "@/server/db/schema";
import { createEntry, updateEntry } from "@/server/services/entries";
import {
  deletePushSubscription,
  dispatchPendingPushes,
  isAllowedPushEndpoint,
  parsePushSubscription,
  savePushSubscription,
  sendTestPush,
  type PushPayload,
  type PushSender,
} from "@/server/services/push";
import type { Trip } from "@/server/services/trips";
import { updateTrip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip, tripInput } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

const config = { sessionSecret: "s".repeat(40), sessionDays: 30 };
const keys = { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) };
const device = (name: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys });

let db: Db;
let cast: ReturnType<typeof insertCast>;
let trip: Trip;

function sessionOf(userId: number): number {
  createSession(db, userId, config);
  return db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).all().at(-1)!.id;
}

/** A fake push service: records what is sent, answers "gone" for some devices. */
function fakeSender(gone: string[] = [], failing: string[] = []) {
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const send: PushSender = async (subscription, payload) => {
    if (failing.includes(subscription.endpoint)) throw new Error("unreachable");
    if (gone.includes(subscription.endpoint)) return { gone: true };
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
    return { gone: false };
  };
  return { send, sent };
}

function publish(title = "Plage des Salines") {
  const result = createEntry(db, cast.publisher, trip.id, entryInput({ title, peopleIds: [cast.guest.id] }), "publish");
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  trip = makeTrip(db, cast.superuser);
  // Notifications from setting up the trip are not part of the tests.
  db.update(notifications).set({ pushedAt: new Date(), readAt: new Date() }).run();
});

describe("devices that receive phone notifications", () => {
  it("only accept the push services of the browsers, over https", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://web.push.apple.com/QGx",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    }
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilpush.apple.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://localhost/x",
      "https://192.168.1.1/x",
      "pas une adresse",
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    }
    expect(parsePushSubscription(device("a"))).toEqual(device("a"));
    expect(parsePushSubscription({ ...device("a"), keys: { p256dh: "court", auth: keys.auth } })).toBeNull();
    expect(parsePushSubscription({ ...device("a"), keys: { p256dh: keys.p256dh, auth: "<script>" } })).toBeNull();
    expect(parsePushSubscription("texte")).toBeNull();
  });

  it("are turned on by a logged-in account, for its own session", () => {
    const session = sessionOf(cast.guest.id);
    expect(savePushSubscription(db, cast.guest, session, device("a"))).toEqual({ ok: true });
    expect(savePushSubscription(db, null, session, device("b"))).toEqual({ ok: false, reason: "forbidden" });
    expect(savePushSubscription(db, cast.guest, null, device("b"))).toEqual({ ok: false, reason: "forbidden" });
    expect(savePushSubscription(db, { ...cast.guest, mustChangePassword: true }, session, device("b"))).toEqual({ ok: false, reason: "forbidden" });
    expect(savePushSubscription(db, cast.guest, session, { endpoint: "https://evil.example/x", keys })).toEqual({ ok: false, reason: "invalid" });
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
  });

  it("move to whoever turns them on again on the same device, without duplicates", () => {
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("a"));
    savePushSubscription(db, cast.publisher, sessionOf(cast.publisher.id), device("a"));
    const rows = db.select().from(pushSubscriptions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(cast.publisher.id);
  });

  it("stop with the session: logging out, or a password change, turns the device off", () => {
    const session = sessionOf(cast.guest.id);
    savePushSubscription(db, cast.guest, session, device("a"));
    db.delete(sessions).where(eq(sessions.id, session)).run();
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
  });

  it("are turned off by their owner only", () => {
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("a"));
    expect(deletePushSubscription(db, cast.publisher, device("a").endpoint)).toBe(false);
    expect(deletePushSubscription(db, cast.guest, device("a").endpoint)).toBe(true);
  });

  it("are limited to 20 per account, the oldest forgotten first", () => {
    const session = sessionOf(cast.guest.id);
    for (let i = 0; i < 22; i++) savePushSubscription(db, cast.guest, session, device(`d${i}`), new Date(2026, 10, 1, 0, i));
    const endpoints = db.select().from(pushSubscriptions).all().map((row) => row.endpoint);
    expect(endpoints).toHaveLength(20);
    expect(endpoints).not.toContain(device("d0").endpoint);
    expect(endpoints).toContain(device("d21").endpoint);
  });
});

describe("sending notifications to phones", () => {
  it("sends the site's sentence to every device of each recipient, once", async () => {
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("marie-phone"));
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("marie-pc"));
    // Paul has no device turned on: nothing for him, but his notification exists on the site.
    publish();
    const { send, sent } = fakeSender();
    expect(await dispatchPendingPushes(db, send)).toEqual({ sent: 2, removed: 0 });
    expect(sent.map((item) => item.endpoint).sort()).toEqual([device("marie-pc").endpoint, device("marie-phone").endpoint]);
    const notification = db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, cast.guest.id))
      .all()
      .find((row) => row.type === "entry_published")!;
    expect(sent[0]!.payload).toEqual({
      title: "Martinique",
      body: "romane a publié « Plage des Salines » dans Martinique. Vous apparaissez dans cette entrée.",
      url: `/notifications/${notification.id}/open`,
      tag: `notification-${notification.id}`,
      badge: 1,
    });

    // Already handed over: not sent twice.
    const again = fakeSender();
    expect(await dispatchPendingPushes(db, again.send)).toEqual({ sent: 0, removed: 0 });
  });

  it("forgets devices their push service no longer knows, and survives one that is unreachable", async () => {
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("gone"));
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("down"));
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("ok"));
    publish();
    const { send, sent } = fakeSender([device("gone").endpoint], [device("down").endpoint]);
    expect(await dispatchPendingPushes(db, send)).toEqual({ sent: 1, removed: 1 });
    expect(sent.map((item) => item.endpoint)).toEqual([device("ok").endpoint]);
    expect(db.select().from(pushSubscriptions).all().map((row) => row.endpoint).sort()).toEqual([device("down").endpoint, device("ok").endpoint]);
  });

  it("sends nothing about what the recipient can no longer see", async () => {
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("a"));
    const entry = publish();
    // Withdrawn before the phones were reached.
    updateEntry(db, cast.publisher, entry.id, entryInput({ title: entry.title, peopleIds: [cast.guest.id] }), "unpublish");
    const { send, sent } = fakeSender();
    await dispatchPendingPushes(db, send);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing to a deactivated account, nor old notifications", async () => {
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("a"));
    publish("Ancienne");
    const twoDaysLater = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect((await dispatchPendingPushes(db, fakeSender().send, twoDaysLater)).sent).toBe(0);

    publish("Pendant la désactivation");
    db.update(users).set({ isActive: false }).where(eq(users.id, cast.guest.id)).run();
    expect((await dispatchPendingPushes(db, fakeSender().send)).sent).toBe(0);
  });

  it("announces a trip shown to everyone", async () => {
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("a"));
    const hidden = makeTrip(db, cast.superuser, { title: "Japon", isVisible: false });
    updateTrip(db, cast.superuser, hidden.id, tripInput({ title: "Japon", isVisible: true }));
    const { send, sent } = fakeSender();
    await dispatchPendingPushes(db, send);
    expect(sent.map((item) => item.payload.body)).toEqual(["admin a rendu visible le voyage « Japon »."]);
  });

  it("sends a test notification to one's own device only", async () => {
    savePushSubscription(db, cast.guest, sessionOf(cast.guest.id), device("a"));
    const { send, sent } = fakeSender();
    expect(await sendTestPush(db, cast.publisher, device("a").endpoint, send)).toBe(false);
    expect(await sendTestPush(db, cast.guest, device("a").endpoint, send)).toBe(true);
    expect(sent[0]!.payload.body).toBe("Les notifications fonctionnent sur cet appareil.");
  });
});

describe("configuration of phone notifications", () => {
  const base = { SESSION_SECRET: "s".repeat(40), ACCESS_TOKEN: "t".repeat(40) };
  const publicKey = `B${"x".repeat(86)}`;
  const privateKey = "y".repeat(43);

  it("is off without keys, and needs both keys", () => {
    expect(parseEnv(base).push).toBeNull();
    expect(() => parseEnv({ ...base, VAPID_PUBLIC_KEY: publicKey })).toThrow(/VAPID_PRIVATE_KEY/);
    expect(() => parseEnv({ ...base, VAPID_PUBLIC_KEY: "abc", VAPID_PRIVATE_KEY: privateKey })).toThrow(/VAPID_PUBLIC_KEY/);
  });

  it("gives the site's address as contact, or the one chosen", () => {
    expect(parseEnv({ ...base, APP_URL: "https://voyages.example.org", VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey }).push).toEqual({
      publicKey,
      privateKey,
      subject: "https://voyages.example.org",
    });
    expect(parseEnv({ ...base, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: "mailto:nous@example.org" }).push?.subject).toBe(
      "mailto:nous@example.org",
    );
  });
});
