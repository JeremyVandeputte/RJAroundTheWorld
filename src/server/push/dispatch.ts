import webpush, { WebPushError } from "web-push";
import { getEnv, type Env } from "@/lib/env";
import { getDb } from "@/server/db/client";
import { dispatchPendingPushes, sendTestPush, type PushSender } from "@/server/services/push";
import type { Actor } from "@/server/permissions";

type PushConfig = NonNullable<Env["push"]>;

/** Hours a push service keeps a message for a phone that is off. */
const TIME_TO_LIVE_S = 24 * 60 * 60;

function webPushSender(config: PushConfig): PushSender {
  return async (subscription, payload) => {
    try {
      await webpush.sendNotification(subscription, payload, {
        vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
        TTL: TIME_TO_LIVE_S,
        urgency: "normal",
        timeout: 10_000,
      });
      return { gone: false };
    } catch (error) {
      // 404 / 410: the device no longer exists for its push service.
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return { gone: true };
      throw error;
    }
  };
}

let running = false;
let again = false;

/**
 * Sends the new notifications to phones, in the background: called after an
 * action that may have created some (an entry published, a trip shown...).
 * Never makes the action wait or fail. Does nothing without VAPID keys.
 */
export function schedulePushDispatch(): void {
  const config = getEnv().push;
  if (!config) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  setTimeout(async () => {
    try {
      do {
        again = false;
        await dispatchPendingPushes(getDb(), webPushSender(config));
      } while (again);
    } catch (error) {
      console.error("Phone notifications could not be sent:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  }, 0);
}

export function isPushConfigured(): boolean {
  return getEnv().push !== null;
}

export async function sendTestPushTo(actor: Actor, endpoint: string): Promise<boolean> {
  const config = getEnv().push;
  return config ? sendTestPush(getDb(), actor, endpoint, webPushSender(config)) : false;
}
