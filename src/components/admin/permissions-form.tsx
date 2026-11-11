"use client";

import { useActionState } from "react";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePermissionsAction } from "@/server/actions/admin";
import { emptyFormState } from "@/server/actions/form-state";

type PermissionsFormProps = {
  userId: number;
  canPublish: boolean;
  canComment: boolean;
  canReact: boolean;
};

export function PermissionsForm({ userId, canPublish, canComment, canReact }: PermissionsFormProps) {
  const [state, formAction] = useActionState(updatePermissionsAction, emptyFormState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <CheckboxField label="Commenter" name="canComment" defaultChecked={canComment} />
        <CheckboxField label="Réagir" name="canReact" defaultChecked={canReact} />
        <CheckboxField
          label="Publier"
          name="canPublish"
          defaultChecked={canPublish}
          hint="Écrire des entrées et voir les voyages non visibles."
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer les permissions</SubmitButton>
    </form>
  );
}
