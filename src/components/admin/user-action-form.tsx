"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyFormState, type FormState } from "@/server/actions/form-state";
import { TemporaryPassword } from "./temporary-password";

type UserActionFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  userId: number;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  /** Extra hidden fields sent with the action. */
  fields?: Record<string, string>;
};

/** Single-button form for an administrative action on one account. */
export function UserActionForm({ action, userId, label, pendingLabel, variant = "secondary", fields }: UserActionFormProps) {
  const [state, formAction] = useActionState(action, emptyFormState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FormMessage state={state} />
      {state.temporaryPassword ? <TemporaryPassword value={state.temporaryPassword} /> : null}
      <SubmitButton variant={variant} pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
