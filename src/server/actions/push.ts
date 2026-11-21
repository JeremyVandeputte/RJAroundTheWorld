"use server";

import { getCurrentSessionId, getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { sendTestPushTo } from "@/server/push/dispatch";
import { deletePushSubscription, savePushSubscription } from "@/server/services/push";

/** This device turns phone notifications on (or confirms they still are). */
export async function savePushSubscriptionAction(subscription: unknown): Promise<{ ok: boolean }> {
  const result = savePushSubscription(getDb(), await getCurrentUser(), await getCurrentSessionId(), subscription);
  return { ok: result.ok };
}

/** This device turns phone notifications off. */
export async function deletePushSubscriptionAction(endpoint: unknown): Promise<void> {
  if (typeof endpoint === "string") deletePushSubscription(getDb(), await getCurrentUser(), endpoint);
}

/** "Envoyer une notification d'essai" on the profile page. */
export async function sendTestPushAction(endpoint: unknown): Promise<{ ok: boolean }> {
  if (typeof endpoint !== "string") return { ok: false };
  return { ok: await sendTestPushTo(await getCurrentUser(), endpoint) };
}
