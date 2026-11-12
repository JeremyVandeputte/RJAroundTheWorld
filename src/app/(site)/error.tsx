"use client";

import Link from "next/link";

// Shown when a page or an action fails unexpectedly, most often because the
// connection dropped. Keeps the header and offers to try again.
export default function SiteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Une erreur est survenue</h1>
      <p className="text-muted">
        La page n&apos;a pas pu être chargée ou l&apos;action n&apos;a pas abouti. Vérifiez votre connexion, puis
        réessayez.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent/90"
        >
          Réessayer
        </button>
        <Link href="/" className="text-accent underline-offset-4 hover:underline">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
