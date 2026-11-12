"use client";

import { useEffect } from "react";
import { usePersistentForm } from "@/components/ui/use-persistent-form";
import { addCommentAction, editCommentAction } from "@/server/actions/social";

type CommentFormProps =
  /** New comment on an entry, or reply to one of its comments. */
  | { mode: "add"; entryId: number; replyToId?: number; onDone?: () => void; onCancel?: () => void }
  /** Edition of an existing comment. */
  | { mode: "edit"; commentId: number; initialBody: string; onDone?: () => void; onCancel?: () => void };

/** Text box used to post, answer or edit a comment. Keeps the text if sending fails. */
export function CommentForm(props: CommentFormProps) {
  const isEdit = props.mode === "edit";
  const { state, pending, formProps } = usePersistentForm(isEdit ? editCommentAction : addCommentAction, {
    resetOnSuccess: !isEdit,
  });
  const isReply = props.mode === "add" && props.replyToId !== undefined;
  const { onDone } = props;

  // Close the reply or edit box once the comment is saved.
  useEffect(() => {
    if (state.success) onDone?.();
  }, [state, onDone]);

  const fieldId = isEdit ? `edit-${props.commentId}` : isReply ? `reply-${props.replyToId}` : "new-comment";

  return (
    <form {...formProps} className="space-y-2">
      {props.mode === "edit" ? (
        <input type="hidden" name="commentId" value={props.commentId} />
      ) : (
        <>
          <input type="hidden" name="entryId" value={props.entryId} />
          {props.replyToId !== undefined ? <input type="hidden" name="replyToId" value={props.replyToId} /> : null}
        </>
      )}
      <label htmlFor={fieldId} className="sr-only">
        {isEdit ? "Modifier le commentaire" : isReply ? "Votre réponse" : "Votre commentaire"}
      </label>
      <textarea
        id={fieldId}
        name="body"
        required
        rows={isReply || isEdit ? 2 : 3}
        maxLength={2000}
        defaultValue={props.mode === "edit" ? props.initialBody : undefined}
        placeholder={isReply ? "Écrire une réponse…" : isEdit ? undefined : "Écrire un commentaire…"}
        className="block w-full rounded-md border border-line bg-white px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? "Envoi…" : isEdit ? "Enregistrer" : isReply ? "Répondre" : "Commenter"}
        </button>
        {props.onCancel ? (
          <button type="button" onClick={props.onCancel} className="min-h-11 text-sm text-muted">
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}
