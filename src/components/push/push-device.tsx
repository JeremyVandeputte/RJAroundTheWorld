"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "@/components/ui/icons";
import { confirmSubscription, currentSubscription, isStandalone, pushSupport, setAppBadge, turnOn } from "@/lib/push-client";

const INVITE_KEY = "rjatw-push-invite";
const button = "inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-base font-medium transition-colors";

/**
 * On every page, for a logged-in person: keeps this device's phone
 * notifications in step with the server, shows the number of unread
 * notifications on the application's icon, and in the installed application
 * invites once to turn notifications on.
 */
export function PushDevice({ publicKey, userId, unread }: { publicKey: string | null; userId: number; unread: number }) {
  const [invite, setInvite] = useState<"hidden" | "shown" | "working" | "done">("hidden");

  useEffect(() => {
    setAppBadge(unread);
  }, [unread]);

  useEffect(() => {
    if (!publicKey) return;
    confirmSubscription(publicKey, userId).catch(() => {});
    (async () => {
      let alreadyAsked = false;
      try {
        alreadyAsked = localStorage.getItem(INVITE_KEY) !== null;
      } catch {
        // Storage blocked: the invitation is shown, at worst once per opening.
      }
      if (alreadyAsked || !isStandalone() || pushSupport() !== "supported" || Notification.permission !== "default") return;
      if (await currentSubscription().catch(() => null)) return;
      setInvite("shown");
    })();
  }, [publicKey, userId]);

  function remember() {
    try {
      localStorage.setItem(INVITE_KEY, new Date().toISOString());
    } catch {
      // Nothing to do.
    }
  }

  async function accept() {
    if (!publicKey) return;
    setInvite("working");
    remember();
    const outcome = await turnOn(publicKey, userId);
    setInvite(outcome === "on" ? "done" : "hidden");
    if (outcome === "on") setTimeout(() => setInvite("hidden"), 3000);
  }

  if (invite === "hidden") return null;
  return (
    <div
      role="dialog"
      aria-labelledby="push-invite-title"
      aria-describedby="push-invite-text"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-lg border border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
    >
      {invite === "done" ? (
        <p role="status" className="flex items-center gap-2 font-medium">
          <BellIcon className="size-5 text-accent" />
          Notifications activées sur cet appareil.
        </p>
      ) : (
        <>
          <p id="push-invite-title" className="flex items-center gap-2 font-semibold">
            <BellIcon className="size-5 text-accent" />
            Recevoir les notifications sur ce téléphone ?
          </p>
          <p id="push-invite-text" className="mt-1 text-sm text-muted">
            Vous serez prévenu dès qu&apos;une entrée est publiée ou qu&apos;un voyage est dévoilé, même application fermée. Modifiable à tout moment dans « Profil ».
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={accept} disabled={invite === "working"} className={`${button} bg-accent text-white hover:bg-accent/90 disabled:opacity-60`}>
              {invite === "working" ? "Activation…" : "Activer"}
            </button>
            <button
              type="button"
              onClick={() => {
                remember();
                setInvite("hidden");
              }}
              className={`${button} border border-line bg-white text-ink hover:bg-paper`}
            >
              Plus tard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
