"use client";

import { useState } from "react";

/** Copies a text to the clipboard, with a visible confirmation. */
export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      // The clipboard is unavailable over plain http (except on localhost).
      setStatus("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center rounded-md border border-line bg-white px-4 py-2 font-medium hover:bg-paper"
      >
        {label}
      </button>
      <span aria-live="polite" className="text-sm text-muted">
        {status === "copied" ? "Copié." : null}
        {status === "failed" ? "Copie impossible : sélectionnez le texte à la main." : null}
      </span>
    </span>
  );
}
