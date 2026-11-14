"use client";

import { useActionState } from "react";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { createUserAction } from "@/server/actions/admin";
import { emptyFormState } from "@/server/actions/form-state";
import { TemporaryPassword } from "./temporary-password";

export function CreateUserForm() {
  const [state, formAction] = useActionState(createUserAction, emptyFormState);
  return (
    <form action={formAction} className="space-y-4">
      <TextField
        label="Identifiant"
        name="username"
        type="text"
        defaultValue={state.values?.username}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        hint="3 à 30 caractères : lettres minuscules, chiffres, point, tiret."
        required
      />
      <TextField
        label="Nom affiché"
        name="displayName"
        type="text"
        defaultValue={state.values?.displayName}
        autoComplete="off"
        maxLength={50}
        required
      />
      <fieldset>
        <legend className="text-sm font-medium">Permissions</legend>
        <CheckboxField label="Publier" name="canPublish" hint="Écrire des entrées dans les voyages qu'il peut voir." />
        <CheckboxField
          label="Gérer les voyages"
          name="canManageTrips"
          hint="Créer des voyages, puis modifier, masquer ou supprimer ceux qu'il a créés."
        />
      </fieldset>
      <FormMessage state={state} />
      {state.temporaryPassword ? <TemporaryPassword value={state.temporaryPassword} /> : null}
      <SubmitButton pendingLabel="Création…">Créer le compte</SubmitButton>
    </form>
  );
}
