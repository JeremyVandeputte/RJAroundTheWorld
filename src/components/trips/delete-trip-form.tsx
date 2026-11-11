"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyFormState } from "@/server/actions/form-state";
import { deleteTripAction } from "@/server/actions/trips";

type DeleteTripFormProps = {
  tripId: number;
  entryCount: number;
  /** False when the trip has entries and the viewer is not the superuser. */
  canDelete: boolean;
};

/** Two-step deletion: the confirmation button is hidden until asked for. */
export function DeleteTripForm({ tripId, entryCount, canDelete }: DeleteTripFormProps) {
  const [state, formAction] = useActionState(deleteTripAction, emptyFormState);
  const entriesLabel = entryCount > 1 ? `${entryCount} entrées` : "1 entrée";

  if (!canDelete) {
    return (
      <p className="text-sm text-muted">
        Ce voyage contient {entriesLabel} : seul l&apos;administrateur peut le supprimer avec son contenu. Vous pouvez le
        rendre non visible.
      </p>
    );
  }

  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-2 text-red-800">Supprimer ce voyage…</summary>
      <p className="mt-2 mb-3 text-sm text-muted">
        {entryCount > 0
          ? `Le voyage sera supprimé définitivement avec ses ${entriesLabel}, leurs commentaires et leurs réactions.`
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
