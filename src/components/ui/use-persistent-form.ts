"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { emptyFormState, type FormState } from "@/server/actions/form-state";

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

/**
 * Form state for long forms: what the user typed stays in place when the
 * server answers with an error. (A plain form action resets every field once
 * the action completes, which would wipe a text typed on a phone.)
 */
export function usePersistentForm(action: FormAction) {
  const [state, dispatch, pending] = useActionState(action, emptyFormState);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Include the clicked button: it carries the chosen action (save, publish...).
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  // `action` keeps the form working before JavaScript has loaded.
  return { state, pending, formProps: { action: dispatch, onSubmit } };
}
