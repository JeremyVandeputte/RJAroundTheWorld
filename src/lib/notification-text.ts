import { REACTIONS } from "./reactions";

// French sentence describing a notification. Kept apart from the database code
// so that it can be tested on its own.

export type NotificationTextInput = {
  type: "entry_published" | "entry_comment" | "entry_reaction" | "comment_reply" | "comment_reaction";
  actorName: string;
  entryTitle: string;
  tripTitle: string;
  isOwnEntry: boolean;
  isTagged: boolean;
  reactionType: string | null;
};

/** French quotes with non-breaking spaces, so they never end up alone on a line. */
function quoted(text: string): string {
  return `« ${text} »`;
}

export function describeNotification(notification: NotificationTextInput): string {
  const { actorName, entryTitle, tripTitle } = notification;
  const emoji = REACTIONS.find((reaction) => reaction.type === notification.reactionType)?.emoji ?? "";
  const reacted = emoji ? `a réagi ${emoji}` : "a réagi";
  const theEntry = notification.isOwnEntry
    ? `votre entrée ${quoted(entryTitle)}`
    : `${quoted(entryTitle)}, une entrée où vous apparaissez`;

  switch (notification.type) {
    case "entry_published":
      return `${actorName} a publié ${quoted(entryTitle)} dans ${tripTitle}.${notification.isTagged ? " Vous apparaissez dans cette entrée." : ""}`;
    case "entry_comment":
      return `${actorName} a commenté ${theEntry}.`;
    case "entry_reaction":
      return `${actorName} ${reacted} à ${theEntry}.`;
    case "comment_reply":
      return `${actorName} a répondu à votre commentaire sur ${quoted(entryTitle)}.`;
    case "comment_reaction":
      return `${actorName} ${reacted} à votre commentaire sur ${quoted(entryTitle)}.`;
  }
}
