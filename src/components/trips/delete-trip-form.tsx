"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyFormState } from "@/server/actions/form-state";
import { deleteTripAction } from "@/server/actions/trips";

/** Two-step deletion: the confirmation button is hidden until asked for. */
export function DeleteTripForm({ tripId, entryCount }: { tripId: number; entryCount: number }) {
  const [state, formAction] = useActionState(deleteTripAction, emptyFormState);
  const entriesLabel = entryCount > 1 ? `ses ${entryCount} entrées` : "son entrée";

  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-2 text-red-800">Supprimer ce voyage…</summary>
      <p className="mt-2 mb-3 text-sm text-muted">
        {entryCount > 0
          ? `Le voyage sera supprimé définitivement avec ${entriesLabel}, y compris celles écrites par d'autres personnes, leurs commentaires et leurs réactions.`
          : "Le voyage sera supprimé définitivement. Il ne contient aucune entrée."}
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="tripId" value={tripId} />
        <FormMessage state={state} />
        <SubmitButton variant="danger" pendingLabel="Suppression…">
          Confirmer la suppression du voyage
        </SubmitButton>
      </form>
    </details>
  );
}
