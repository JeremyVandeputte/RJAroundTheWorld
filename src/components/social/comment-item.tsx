"use client";

import { useCallback, useState } from "react";
import { usePersistentForm } from "@/components/ui/use-persistent-form";
import { deleteCommentAction } from "@/server/actions/social";
import { CommentForm } from "./comment-form";
import { LocalDateTime } from "./local-date-time";
import { ReactionBar, type ReactionBarData } from "./reaction-bar";

export type CommentItemData = {
  id: number;
  authorName: string | null;
  body: string;
  createdAt: string;
  isEdited: boolean;
  isDeleted: boolean;
  canEdit: boolean;
  canDelete: boolean;
  reactions: ReactionBarData;
};

type CommentItemProps = {
  entryId: number;
  comment: CommentItemData;
  /** The viewer may post comments and replies. */
  canComment: boolean;
  canReact: boolean;
};

const linkButton = "min-h-11 text-sm font-medium";

function DeleteCommentForm({ commentId, onCancel }: { commentId: number; onCancel: () => void }) {
  const { state, pending, formProps } = usePersistentForm(deleteCommentAction);
  return (
    <form {...formProps} className="flex flex-wrap items-center gap-3 text-sm">
      <input type="hidden" name="commentId" value={commentId} />
      <span className="text-muted">Supprimer ce commentaire ?</span>
      <button type="submit" disabled={pending} className={`${linkButton} text-red-800 disabled:opacity-60`}>
        Confirmer
      </button>
      <button type="button" onClick={onCancel} className={`${linkButton} text-muted`}>
        Annuler
      </button>
      {state.error ? (
        <span role="alert" className="text-red-800">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** One comment or reply, with its reactions and the actions the viewer may take. */
export function CommentItem({ entryId, comment, canComment, canReact }: CommentItemProps) {
  const [mode, setMode] = useState<"view" | "reply" | "edit" | "delete">("view");
  const backToView = useCallback(() => setMode("view"), []);

  if (comment.isDeleted) {
    return (
      <div id={`comment-${comment.id}`} className="scroll-mt-4 text-sm text-muted italic">
        Commentaire supprimé
      </div>
    );
  }

  return (
    <div id={`comment-${comment.id}`} className="scroll-mt-4 space-y-1.5">
      <p className="text-sm">
        <span className="font-semibold">{comment.authorName ?? "Compte supprimé"}</span>{" "}
        <span className="text-muted">
          <LocalDateTime iso={comment.createdAt} />
          {comment.isEdited ? " (modifié)" : ""}
        </span>
      </p>

      {mode === "edit" ? (
        <CommentForm mode="edit" commentId={comment.id} initialBody={comment.body} onDone={backToView} onCancel={backToView} />
      ) : (
        <p className="break-words whitespace-pre-wrap">{comment.body}</p>
      )}

      <ReactionBar target={{ commentId: comment.id }} data={comment.reactions} canReact={canReact} compact />

      {mode === "view" && (canComment || comment.canEdit || comment.canDelete) ? (
        <div className="flex flex-wrap gap-x-4">
          {canComment ? (
            <button type="button" onClick={() => setMode("reply")} className={`${linkButton} text-accent`}>
              Répondre
            </button>
          ) : null}
          {comment.canEdit ? (
            <button type="button" onClick={() => setMode("edit")} className={`${linkButton} text-muted`}>
              Modifier
            </button>
          ) : null}
          {comment.canDelete ? (
            <button type="button" onClick={() => setMode("delete")} className={`${linkButton} text-muted`}>
              Supprimer
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "reply" ? (
        <CommentForm mode="add" entryId={entryId} replyToId={comment.id} onDone={backToView} onCancel={backToView} />
      ) : null}
      {mode === "delete" ? <DeleteCommentForm commentId={comment.id} onCancel={backToView} /> : null}
    </div>
  );
}
