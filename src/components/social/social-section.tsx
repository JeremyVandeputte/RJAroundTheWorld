import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { canComment, canReact } from "@/server/permissions";
import { listCommentThreads, type CommentView } from "@/server/services/comments";
import type { Entry } from "@/server/services/entries";
import { getEntryReactions, type ReactionSummary } from "@/server/services/reactions";
import type { Trip } from "@/server/services/trips";
import { CommentForm } from "./comment-form";
import { CommentItem, type CommentItemData } from "./comment-item";
import { ReactionBar } from "./reaction-bar";

type SocialSectionProps = { db: Db; viewer: SessionUser | null; trip: Trip; entry: Entry };

const noReactions: ReactionSummary = {
  counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
  mine: null,
  people: [],
};

/**
 * Reactions and comments of a published entry (pages are only shown to
 * logged-in users; the services still refuse anything to anyone else).
 */
export function SocialSection({ db, viewer, trip, entry }: SocialSectionProps) {
  if (entry.status !== "published") return null;

  const threads = listCommentThreads(db, viewer, trip, entry);
  const reactions = getEntryReactions(db, viewer, trip, entry);
  if (threads === null || reactions === null) return null;

  const mayComment = canComment(viewer, trip, entry);
  const mayReact = canReact(viewer, trip, entry);
  const toItem = (comment: CommentView): CommentItemData => ({
    id: comment.id,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    isEdited: comment.editedAt !== null,
    isDeleted: comment.isDeleted,
    canEdit: comment.canEdit,
    canDelete: comment.canDelete,
    reactions: reactions.comments.get(comment.id) ?? noReactions,
  });
  const commentCount = threads.reduce(
    (total, thread) => total + (thread.isDeleted ? 0 : 1) + thread.replies.filter((reply) => !reply.isDeleted).length,
    0,
  );

  return (
    <section aria-labelledby="comments-title" className="space-y-5 border-t border-line pt-4">
      <ReactionBar target={{ entryId: entry.id }} data={reactions.entry} canReact={mayReact} />

      <h2 id="comments-title" className="scroll-mt-4 text-lg font-semibold">
        Commentaires{commentCount > 0 ? ` (${commentCount})` : ""}
      </h2>

      {threads.length === 0 ? <p className="text-sm text-muted">Aucun commentaire pour le moment.</p> : null}

      <ul className="space-y-5">
        {threads.map((thread) => (
          <li key={thread.id}>
            <CommentItem entryId={entry.id} comment={toItem(thread)} canComment={mayComment} canReact={mayReact} />
            {thread.replies.length > 0 ? (
              <ul className="mt-4 space-y-4 border-l-2 border-line pl-4">
                {thread.replies.map((reply) => (
                  <li key={reply.id}>
                    <CommentItem entryId={entry.id} comment={toItem(reply)} canComment={mayComment} canReact={mayReact} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {mayComment ? (
        <CommentForm mode="add" entryId={entry.id} />
      ) : (
        <p className="text-sm text-muted">Votre compte n&apos;a pas la permission de commenter.</p>
      )}
    </section>
  );
}
