"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { emptyFormState, type FormState } from "@/server/actions/form-state";

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

const NETWORK_ERROR =
  "Connexion interrompue : rien n'a été envoyé. Ce que vous avez saisi est conservé, réessayez dès que le réseau revient.";
const SERVER_ERROR =
  "Le serveur a rencontré une erreur. L'action a peut-être été enregistrée : rechargez la page pour vérifier avant de réessayer. Ce que vous avez saisi est conservé.";

/**
 * True when the request could not reach the server at all. Browsers report
 * this as a TypeError ("Failed to fetch", "Load failed", "NetworkError...").
 * Any other failure means the server received the request and then failed.
 */
function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError && /fetch|load failed|network/i.test(error.message);
}

/**
 * Form state for long forms, written for unreliable mobile connections:
 * - what the user typed stays in place when the server answers with an error
 *   (a plain form action resets every field once the action completes);
 * - if the request fails, a message is shown and the form is left untouched,
 *   instead of the page being replaced by an error. The message says whether
 *   nothing was sent (network) or the server failed (it may have saved).
 */
export function usePersistentForm(action: FormAction, options: { resetOnSuccess?: boolean } = {}) {
  // Used as is only before JavaScript has loaded (plain form submission).
  const [initialState, formAction] = useActionState(action, emptyFormState);
  const [state, setState] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Include the clicked button: it carries the chosen action (save, publish...).
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = event.currentTarget;
    const formData = new FormData(form, submitter);
    startTransition(async () => {
      try {
        const result = await action(emptyFormState, formData);
        setState(result);
        // Short forms (a comment box) are emptied once their content is saved.
        if (options.resetOnSuccess && !result.error) form.reset();
      } catch (error) {
        // Redirections after a successful save are signalled by an error: let them through.
        unstable_rethrow(error);
        setState({ error: isNetworkFailure(error) ? NETWORK_ERROR : SERVER_ERROR });
      }
    });
  }

  return { state: state ?? initialState, pending, formProps: { action: formAction, onSubmit } };
}
