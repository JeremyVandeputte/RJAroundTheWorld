// Browser side of phone notifications (web push). Only used in client components.

import { deletePushSubscriptionAction, savePushSubscriptionAction } from "@/server/actions/push";

export type PushSupport =
  /** Ready: the device can be turned on. */
  | "supported"
  /** iPhone/iPad in Safari: only the installed application can receive notifications. */
  | "install-first"
  /** Browser without notifications (old phone, private window...). */
  | "unsupported";

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isAppleMobile(): boolean {
  // iPadOS presents itself as a Mac with a touch screen.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function pushSupport(): PushSupport {
  const capable = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (capable) return "supported";
  return isAppleMobile() && !isStandalone() ? "install-first" : "unsupported";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return true;
  const expected = keyBytes(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

// Account that turned notifications on in this browser: after someone else
// logs in on the same device, they are not carried over to them.
const OWNER_KEY = "rjatw-push-user";

function readOwner(): string | null | undefined {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return undefined;
  }
}

function writeOwner(userId: number | null): void {
  try {
    if (userId === null) localStorage.removeItem(OWNER_KEY);
    else localStorage.setItem(OWNER_KEY, String(userId));
  } catch {
    // Storage blocked: nothing remembered.
  }
}

/** Notifications of this browser belong to this account (storage blocked: assumed yes). */
export function ownsSubscription(userId: number): boolean {
  const owner = readOwner();
  return owner === undefined || owner === String(userId);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // Registered by <ServiceWorker />; waits until it is active.
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  return (await registration()).pushManager.getSubscription();
}

/**
 * Asks for the permission (must follow a tap on a button), subscribes this
 * device and tells the server. Returns the outcome to show.
 */
export async function turnOn(publicKey: string, userId: number): Promise<"on" | "denied" | "failed"> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "failed";
    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    if (subscription && !sameKey(subscription, publicKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const saved = await savePushSubscriptionAction(subscription.toJSON());
    if (saved.ok) writeOwner(userId);
    return saved.ok ? "on" : "failed";
  } catch {
    return "failed";
  }
}

export async function turnOff(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await deletePushSubscriptionAction(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => false);
  writeOwner(null);
}

/**
 * On each opening of the site: a device already turned on is confirmed to the
 * server, under the current session (after logging in again, or if the keys
 * of the server changed).
 */
export async function confirmSubscription(publicKey: string, userId: number): Promise<void> {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return;
  const reg = await registration();
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  if (!ownsSubscription(userId)) {
    // Turned on by someone else who has logged out: this person has to choose for themselves.
    await subscription.unsubscribe().catch(() => false);
    writeOwner(null);
    return;
  }
  if (!sameKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  }
  await savePushSubscriptionAction(subscription.toJSON());
}

/** Number on the application's icon (installed app), where the device supports it. */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!nav.setAppBadge || !nav.clearAppBadge) return;
  (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(() => {});
}
