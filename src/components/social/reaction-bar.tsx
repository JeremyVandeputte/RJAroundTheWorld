"use client";

import { usePersistentForm } from "@/components/ui/use-persistent-form";
import { REACTIONS, type ReactionKind } from "@/lib/reactions";
import { reactAction } from "@/server/actions/social";

export type ReactionBarData = {
  counts: Record<ReactionKind, number>;
  mine: ReactionKind | null;
  people: { name: string; type: ReactionKind }[];
};

type ReactionBarProps = {
  target: { entryId: number } | { commentId: number };
  data: ReactionBarData;
  /** False for accounts without the Réagir permission: counts only. */
  canReact: boolean;
  /** Small buttons, used for comments and replies. */
  compact?: boolean;
};

const emojiOf = (type: ReactionKind) => REACTIONS.find((reaction) => reaction.type === type)?.emoji ?? "";

/**
 * The six reactions of an entry or a comment: counts per type, the viewer's
 * own choice highlighted, and the list of who reacted what.
 * Clicking a reaction sets it; clicking the current one removes it.
 */
export function ReactionBar({ target, data, canReact, compact = false }: ReactionBarProps) {
  const { state, pending, formProps } = usePersistentForm(reactAction);
  const total = data.people.length;
  const size = compact ? "h-7 min-w-7 px-1.5 text-xs" : "min-h-11 min-w-11 px-2.5 text-base";

  return (
    <div className="space-y-1">
      <form {...formProps} className={`flex flex-wrap items-center ${compact ? "gap-1" : "gap-1.5"}`}>
        {"commentId" in target ? (
          <input type="hidden" name="commentId" value={target.commentId} />
        ) : (
          <input type="hidden" name="entryId" value={target.entryId} />
        )}
        {REACTIONS.map((reaction) => {
          const reactionCount = data.counts[reaction.type];
          const isMine = data.mine === reaction.type;
          const look = isMine ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line bg-white text-ink";
          const content = (
            <>
              <span aria-hidden="true">{reaction.emoji}</span>
              {reactionCount > 0 ? <span className="ml-1 tabular-nums">{reactionCount}</span> : null}
            </>
          );
          if (!canReact) {
            // Read-only: only reactions that were actually given are listed.
            return reactionCount > 0 ? (
              <span
                key={reaction.type}
                title={reaction.label}
                className={`inline-flex items-center justify-center rounded-full border ${size} ${look}`}
              >
                {content}
                <span className="sr-only"> {reaction.label}</span>
              </span>
            ) : null;
          }
          return (
            <button
              key={reaction.type}
              type="submit"
              name="type"
              value={reaction.type}
              disabled={pending}
              aria-pressed={isMine}
              aria-label={`${reaction.label}${reactionCount > 0 ? ` (${reactionCount})` : ""}`}
              title={isMine ? `${reaction.label} : retirer ma réaction` : reaction.label}
              className={`inline-flex items-center justify-center rounded-full border hover:border-accent disabled:opacity-60 ${size} ${look}`}
            >
              {content}
            </button>
          );
        })}
      </form>

      {state.error ? (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      {total > 0 ? (
        <details className={`text-muted ${compact ? "text-xs" : "text-sm"}`}>
          <summary className="cursor-pointer py-1">
            {total} réaction{total > 1 ? "s" : ""} : voir qui a réagi
          </summary>
          <ul className="mt-1 space-y-0.5">
            {data.people.map((person, index) => (
              <li key={index}>
                <span aria-hidden="true">{emojiOf(person.type)}</span> {person.name}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
