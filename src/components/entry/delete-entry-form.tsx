"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteEntryAction } from "@/server/actions/entries";
import { emptyFormState } from "@/server/actions/form-state";

/** Two-step deletion: the confirmation button is hidden until asked for. */
export function DeleteEntryForm({ entryId }: { entryId: number }) {
  const [state, formAction] = useActionState(deleteEntryAction, emptyFormState);
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-2 text-red-800">Supprimer cette entrée…</summary>
      <p className="mt-2 mb-3 text-sm text-muted">
        L&apos;entrée sera supprimée définitivement, avec ses commentaires et ses réactions.
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="entryId" value={entryId} />
        <FormMessage state={state} />
        <SubmitButton variant="danger" pendingLabel="Suppression…">
          Confirmer la suppression
        </SubmitButton>
      </form>
    </details>
  );
}
