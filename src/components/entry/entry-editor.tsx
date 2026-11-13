"use client";

import { useEffect, useState } from "react";
import { clearDraft, loadDraft, sameValues, type StoredDraft } from "@/lib/entry-draft";
import { EntryForm, type EntryFormProps } from "./entry-form";

const savedAtFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/**
 * Entry form plus the recovery of a local draft: if this device kept changes
 * that were never saved (lost connection, page closed), they can be resumed.
 */
export function EntryEditor(props: EntryFormProps) {
  const [found, setFound] = useState<StoredDraft | null>(null);
  const [defaults, setDefaults] = useState(props.defaults);
  // Changing the key rebuilds the form with the resumed values.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const draft = loadDraft(props.draftKey);
    if (!draft) return;
    if (sameValues(draft.values, props.defaults)) clearDraft(props.draftKey);
    else setFound(draft);
  }, [props.draftKey, props.defaults]);

  function resume() {
    if (!found) return;
    setDefaults(found.values);
    setVersion((current) => current + 1);
    setFound(null);
  }

  function discard() {
    clearDraft(props.draftKey);
    setFound(null);
  }

  return (
    <div className="space-y-4">
      {found ? (
        <div role="status" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p>
            Des modifications non enregistrées du {savedAtFormat.format(new Date(found.savedAt))} ont été retrouvées sur cet
            appareil.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={resume}
              className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-medium text-white hover:bg-accent/90"
            >
              Reprendre ces modifications
            </button>
            <button type="button" onClick={discard} className="inline-flex min-h-11 items-center px-2 text-amber-950 underline">
              Les ignorer
            </button>
          </div>
        </div>
      ) : null}
      <EntryForm key={version} {...props} defaults={defaults} />
    </div>
  );
}
