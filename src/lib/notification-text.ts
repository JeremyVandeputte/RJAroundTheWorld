// French sentence describing a notification. Kept apart from the database code
// so that it can be tested on its own.

export type NotificationTextInput = {
  type: "entry_published" | "entry_tagged" | "trip_revealed";
  actorName: string;
  /** Null for notifications about a whole trip. */
  entryTitle: string | null;
  tripTitle: string;
  isTagged: boolean;
};

/** French quotes with non-breaking spaces, so they never end up alone on a line. */
function quoted(text: string): string {
  return `« ${text} »`;
}

export function describeNotification(notification: NotificationTextInput): string {
  const { actorName, tripTitle } = notification;
  const entryTitle = notification.entryTitle ?? "";

  switch (notification.type) {
    case "entry_published":
      return `${actorName} a publié ${quoted(entryTitle)} dans ${tripTitle}.${notification.isTagged ? " Vous apparaissez dans cette entrée." : ""}`;
    case "entry_tagged":
      return `${actorName} a indiqué votre présence dans ${quoted(entryTitle)}.`;
    case "trip_revealed":
      return `${actorName} a rendu visible le voyage ${quoted(tripTitle)}.`;
  }
}
