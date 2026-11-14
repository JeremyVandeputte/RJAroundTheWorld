"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ChangeEvent } from "react";

const MAX_BYTES = 8 * 1024 * 1024;

type SitePhotoAdminProps = {
  /** Address of the current photo (header size), or null. */
  photoUrl: string | null;
};

/**
 * Chooses the site photo: shown in a circle left of the site name and as
 * the icon of the browser tab. Sent as is; the server keeps two small
 * square versions.
 */
export function SitePhotoAdmin({ photoUrl }: SitePhotoAdminProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function send(method: "POST" | "DELETE", body?: File) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/site-photo", { method, body });
      const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) {
        setMessage({ text: data.error ?? "L'enregistrement a échoué. Réessayez.", isError: true });
        return;
      }
      setMessage({ text: data.message ?? "Enregistré.", isError: false });
      // Header and tab icon come from the server: reload them.
      startTransition(() => router.refresh());
    } catch {
      setMessage({ text: "Connexion interrompue : rien n'a été envoyé. Réessayez dès que le réseau revient.", isError: true });
    } finally {
      setBusy(false);
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setMessage({ text: "Cette image est trop lourde (8 Mo au maximum).", isError: true });
      return;
    }
    void send("POST", file);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-md border border-line bg-white px-4 py-3">
        {photoUrl ? (
          <img src={photoUrl} alt="Photo actuelle du site" width={48} height={48} className="size-12 rounded-full object-cover ring-1 ring-line" />
        ) : (
          <span aria-hidden="true" className="size-12 rounded-full border border-dashed border-line bg-paper" />
        )}
        <span className="text-sm text-muted">{photoUrl ? "Photo actuelle, telle qu'elle apparaît dans l'en-tête." : "Aucune photo pour le moment."}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <label
          className={`inline-flex min-h-11 cursor-pointer items-center rounded-md bg-accent px-4 font-medium text-white hover:bg-accent/90 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {busy ? "Envoi…" : photoUrl ? "Changer la photo" : "Choisir une photo"}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} disabled={busy} className="sr-only" />
        </label>
        {photoUrl ? (
          <button
            type="button"
            onClick={() => void send("DELETE")}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-md border border-line bg-white px-4 font-medium text-red-800 hover:bg-paper disabled:opacity-60"
          >
            Retirer la photo
          </button>
        ) : null}
      </div>

      {message ? (
        <p role={message.isError ? "alert" : "status"} className={`text-sm ${message.isError ? "text-red-800" : "text-accent"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
