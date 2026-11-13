"use client";

import { CheckboxField } from "@/components/ui/checkbox-field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { usePersistentForm } from "@/components/ui/use-persistent-form";
import { saveTripAction } from "@/server/actions/trips";

type TripFormProps = {
  /** Existing trip to edit; omitted when creating one. */
  trip?: {
    id: number;
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    isVisible: boolean;
  };
};

export function TripForm({ trip }: TripFormProps) {
  const { state, pending, formProps } = usePersistentForm(saveTripAction);
  return (
    <form {...formProps} className="space-y-4">
      {trip ? <input type="hidden" name="tripId" value={trip.id} /> : null}
      <TextField label="Titre" name="title" type="text" defaultValue={trip?.title} maxLength={100} required />
      <TextareaField
        label="Description courte"
        name="description"
        defaultValue={trip?.description}
        maxLength={500}
        rows={3}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Date de début" name="startDate" type="date" defaultValue={trip?.startDate} required />
        <TextField label="Date de fin" name="endDate" type="date" defaultValue={trip?.endDate} required />
      </div>
      {trip ? (
        <CheckboxField
          label="Voyage visible"
          name="isVisible"
          defaultChecked={trip?.isVisible ?? false}
          hint="Décoché : seuls la personne qui a créé le voyage et l'administrateur le voient. Coché : toutes ses entrées publiées deviennent visibles d'un coup."
        />
      ) : (
        <p className="rounded-md border border-line bg-white px-3 py-2 text-sm text-muted">
          Le voyage est créé non visible. Vous pourrez ensuite lui ajouter une miniature, puis le rendre visible.
        </p>
      )}
      <FormMessage state={state} />
      <SubmitButton pending={pending} pendingLabel="Enregistrement…">
        {trip ? "Enregistrer le voyage" : "Créer le voyage"}
      </SubmitButton>
    </form>
  );
}
