"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { loginAction } from "@/server/actions/auth";
import { emptyFormState } from "@/server/actions/form-state";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, emptyFormState);
  return (
    <form action={formAction} className="space-y-4">
      <TextField
        label="Identifiant"
        name="username"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <PasswordField label="Mot de passe" name="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
    </form>
  );
}
