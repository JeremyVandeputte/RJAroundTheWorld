"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-rules";
import { changePasswordAction } from "@/server/actions/auth";
import { emptyFormState } from "@/server/actions/form-state";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, emptyFormState);
  return (
    <form action={formAction} className="space-y-4">
      <TextField
        label="Mot de passe actuel"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
      />
      <TextField
        label="Nouveau mot de passe"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        hint={`${PASSWORD_MIN_LENGTH} caractères au minimum. Évitez les mots de passe courants.`}
        required
      />
      <TextField
        label="Confirmer le nouveau mot de passe"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Enregistrement…">Changer le mot de passe</SubmitButton>
    </form>
  );
}
