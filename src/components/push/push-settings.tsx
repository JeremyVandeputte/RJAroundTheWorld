"use client";

import { useEffect, useState } from "react";
import { currentSubscription, ownsSubscription, pushSupport, turnOff, turnOn } from "@/lib/push-client";
import { sendTestPushAction } from "@/server/actions/push";

type State = "loading" | "install-first" | "unsupported" | "denied" | "off" | "on" | "working";
const button = "inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-base font-medium transition-colors disabled:opacity-60";
const primary = `${button} bg-accent text-white hover:bg-accent/90`;
const secondary = `${button} border border-line bg-white text-ink hover:bg-paper`;

/** "Notifications sur cet appareil", on the profile page. */
export function PushSettings({ publicKey, userId }: { publicKey: string; userId: number }) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const support = pushSupport();
      if (support !== "supported") return setState(support);
      if (Notification.permission === "denied") return setState("denied");
      const subscription = await currentSubscription().catch(() => null);
      setState(subscription && Notification.permission === "granted" && ownsSubscription(userId) ? "on" : "off");
    })();
  }, []);

  async function activate() {
    setState("working");
    setMessage("");
    const outcome = await turnOn(publicKey, userId);
    if (outcome === "on") setMessage("Notifications activées sur cet appareil.");
    if (outcome === "failed") setMessage("L'activation n'a pas abouti. Vérifiez la connexion et réessayez.");
    setState(outcome === "on" ? "on" : outcome === "denied" ? "denied" : "off");
  }

  async function deactivate() {
    setState("working");
    await turnOff();
    setMessage("Notifications désactivées sur cet appareil.");
    setState("off");
  }

  async function test() {
    setMessage("");
    const subscription = await currentSubscription().catch(() => null);
    const result = subscription ? await sendTestPushAction(subscription.endpoint).catch(() => ({ ok: false })) : { ok: false };
    setMessage(
      result.ok
        ? "Notification d'essai envoyée : elle doit apparaître dans quelques secondes."
        : "L'envoi n'a pas abouti. Désactivez puis réactivez les notifications.",
    );
  }

  return (
    <div className="space-y-3">
      {state === "loading" ? <p className="text-muted">…</p> : null}
      {state === "install-first" ? (
        <p className="text-muted">
          Sur iPhone et iPad, les notifications ne fonctionnent que dans l&apos;application installée : dans Safari, touchez le bouton Partager puis « Sur
          l&apos;écran d&apos;accueil », ouvrez le site depuis son icône et revenez ici.
        </p>
      ) : null}
      {state === "unsupported" ? <p className="text-muted">Ce navigateur ne permet pas de recevoir les notifications.</p> : null}
      {state === "denied" ? (
        <p className="text-muted">
          Les notifications sont bloquées pour ce site sur cet appareil. Pour les autoriser, ouvrez les réglages du téléphone (ou du navigateur), section
          Notifications, puis revenez ici.
        </p>
      ) : null}
      {state === "off" || state === "on" || state === "working" ? (
        <>
          <p className="text-muted">
            {state === "on"
              ? "Activées : cet appareil affiche les notifications du site, même application fermée."
              : "Recevez sur cet appareil une notification dès qu'une entrée est publiée ou qu'un voyage est dévoilé, même application fermée."}
          </p>
          <div className="flex flex-wrap gap-2">
            {state === "on" ? (
              <>
                <button type="button" onClick={test} className={primary}>
                  Envoyer une notification d&apos;essai
                </button>
                <button type="button" onClick={deactivate} className={secondary}>
                  Désactiver
                </button>
              </>
            ) : (
              <button type="button" onClick={activate} disabled={state === "working"} className={primary}>
                {state === "working" ? "…" : "Activer les notifications sur cet appareil"}
              </button>
            )}
          </div>
        </>
      ) : null}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
