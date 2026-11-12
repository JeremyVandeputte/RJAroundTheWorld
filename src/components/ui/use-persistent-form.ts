"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { emptyFormState, type FormState } from "@/server/actions/form-state";

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

const NETWORK_ERROR =
  "Connexion interrompue : rien n'a été envoyé. Ce que vous avez saisi est conservé, réessayez dès que le réseau revient.";

/**
 * Form state for long forms, written for unreliable mobile connections:
 * - what the user typed stays in place when the server answers with an error
 *   (a plain form action resets every field once the action completes);
 * - if the request cannot reach the server at all, a message is shown and the
 *   form is left untouched, instead of the page being replaced by an error.
 */
export function usePersistentForm(action: FormAction) {
  // Used as is only before JavaScript has loaded (plain form submission).
  const [initialState, formAction] = useActionState(action, emptyFormState);
  const [state, setState] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Include the clicked button: it carries the chosen action (save, publish...).
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(async () => {
      try {
        setState(await action(emptyFormState, formData));
      } catch (error) {
        // Redirections after a successful save are signalled by an error: let them through.
        unstable_rethrow(error);
        setState({ error: NETWORK_ERROR });
      }
    });
  }

  return { state: state ?? initialState, pending, formProps: { action: formAction, onSubmit } };
}
