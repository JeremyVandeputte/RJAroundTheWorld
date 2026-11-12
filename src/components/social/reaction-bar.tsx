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
  /**
   * For comments: smaller buttons, and only the reactions already given are
   * shown; the others unfold behind "Réagir".
   */
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
  const size = compact ? "min-h-9 min-w-9 px-2 text-sm" : "min-h-11 min-w-11 px-2.5 text-base";

  function renderReaction(reaction: (typeof REACTIONS)[number]) {
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
      return (
        <span
          key={reaction.type}
          title={reaction.label}
          className={`inline-flex items-center justify-center rounded-full border ${size} ${look}`}
        >
          {content}
          <span className="sr-only"> {reaction.label}</span>
        </span>
      );
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
  }

  const given = REACTIONS.filter((reaction) => data.counts[reaction.type] > 0);
  // Without the permission, only reactions that were actually given are listed.
  const alwaysShown = compact || !canReact ? given : REACTIONS;
  const unfolded = compact && canReact ? REACTIONS.filter((reaction) => data.counts[reaction.type] === 0) : [];

  return (
    <div className="space-y-1">
      <form {...formProps} className="flex flex-wrap items-center gap-1.5">
        {"commentId" in target ? (
          <input type="hidden" name="commentId" value={target.commentId} />
        ) : (
          <input type="hidden" name="entryId" value={target.entryId} />
        )}
        {alwaysShown.map(renderReaction)}
        {unfolded.length > 0 ? (
          <details className="group/react flex flex-wrap items-center gap-1.5 open:flex">
            <summary
              className={`inline-flex cursor-pointer list-none items-center justify-center rounded-full border border-line bg-white px-3 text-muted hover:border-accent group-open/react:hidden ${size}`}
            >
              Réagir
            </summary>
            {unfolded.map(renderReaction)}
          </details>
        ) : null}
      </form>

      {state.error ? (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      {total > 0 ? (
        <details className="text-sm text-muted">
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
