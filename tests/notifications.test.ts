import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { describeNotification } from "@/lib/notification-text";
import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { notifications, users } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { deleteUser } from "@/server/services/admin";
import { addComment, deleteComment, type Comment } from "@/server/services/comments";
import { createEntry, deleteEntry, updateEntry, type Entry, type EntryInput } from "@/server/services/entries";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/services/notifications";
import { react } from "@/server/services/reactions";
import { createTrip, updateTrip, type Trip } from "@/server/services/trips";
import { entryInput, insertCast, insertUser, tripInput } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let tripOwner: SessionUser;
let paulette: SessionUser; // another guest, identified in nothing
let trip: Trip;

function mustTrip(actor: Actor, overrides = {}): Trip {
  const result = createTrip(db, actor, tripInput(overrides));
  if (!result.ok) throw new Error(result.reason);
  return result.trip;
}
/** Entry by Romane (publisher), identifying Marie (guest) unless told otherwise. */
function mustEntry(intent: "save" | "publish", overrides: Partial<EntryInput> = {}, actor: Actor = cast.publisher, inTrip: Trip = trip): Entry {
  const result = createEntry(db, actor, inTrip.id, entryInput({ peopleIds: [cast.guest.id], ...overrides }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}
function mustComment(actor: Actor, entry: Entry, body: string, replyToId: number | null = null): Comment {
  const result = addComment(db, actor, entry.id, { body, replyToId });
  if (!result.ok) throw new Error(result.reason);
  return result.comment;
}
/** Raw notification rows, as "recipient:type". */
const sent = () =>
  db
    .select({ recipient: users.username, type: notifications.type })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.recipientId))
    .orderBy(notifications.id)
    .all()
    .map((row) => `${row.recipient}:${row.type}`)
    .sort();
const clear = () => db.delete(notifications).run();
const inbox = (actor: Actor) => listNotifications(db, actor);
/** Notification sentence, with ordinary spaces for readable expectations. */
const sentence = (notice: Parameters<typeof describeNotification>[0]) => describeNotification(notice).replaceAll(" ", " ");

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db); // admin (superuser), romane & paul (Publier), marie (guest), lucie (Gérer les voyages)
  tripOwner = insertUser(db, "chloe", { canPublish: true, canManageTrips: true });
  paulette = insertUser(db, "paulette");
  trip = mustTrip(cast.superuser);
});

describe("publishing an entry", () => {
  it("notifies everyone who can see it, except its author", () => {
    mustEntry("publish");
    expect(sent()).toEqual(
      ["admin", "chloe", "lucie", "marie", "paul", "paulette"].map((name) => `${name}:entry_published`),
    );
  });

  it("mentions it to the people identified in the entry", () => {
    mustEntry("publish", { peopleIds: [cast.guest.id, cast.publisher.id] });
    const [forMarie] = inbox(cast.guest);
    const [forPaul] = inbox(cast.otherPublisher);
    expect(forMarie?.isTagged).toBe(true);
    expect(forPaul?.isTagged).toBe(false);
    expect(sentence(forMarie!)).toBe(
      "romane a publié « Première baignade » dans Martinique. Vous apparaissez dans cette entrée.",
    );
    expect(sentence(forPaul!)).toBe("romane a publié « Première baignade » dans Martinique.");
  });

  it("does not notify for a draft, only when it is published", () => {
    const draft = mustEntry("save");
    expect(sent()).toEqual([]);
    updateEntry(db, cast.publisher, draft.id, entryInput({ peopleIds: [cast.guest.id] }), "save");
    expect(sent()).toEqual([]);
    updateEntry(db, cast.publisher, draft.id, entryInput({ peopleIds: [cast.guest.id] }), "publish");
    expect(sent()).toHaveLength(6);
  });

  it("notifies only once: editing, unpublishing and publishing again send nothing new", () => {
    const entry = mustEntry("publish");
    clear();
    const input = entryInput({ peopleIds: [cast.guest.id] });
    updateEntry(db, cast.publisher, entry.id, input, "save");
    updateEntry(db, cast.publisher, entry.id, input, "unpublish");
    updateEntry(db, cast.publisher, entry.id, input, "publish");
    expect(sent()).toEqual([]);
  });

  it("in a hidden trip, notifies only its creator and the superuser", () => {
    const hidden = mustTrip(tripOwner, { title: "Caché", isVisible: false });
    mustEntry("publish", {}, cast.superuser, hidden);
    expect(sent()).toEqual(["chloe:entry_published"]);
    clear();
    mustEntry("publish", {}, tripOwner, hidden);
    expect(sent()).toEqual(["admin:entry_published"]);
  });

  it("skips deactivated accounts", () => {
    db.update(users).set({ isActive: false }).where(eq(users.id, paulette.id)).run();
    mustEntry("publish");
    expect(sent()).not.toContain("paulette:entry_published");
  });

  it("never notifies the person who publishes, even for someone else's draft", () => {
    const draft = mustEntry("save");
    updateEntry(db, cast.superuser, draft.id, entryInput({ peopleIds: [cast.guest.id] }), "publish");
    expect(sent()).not.toContain("admin:entry_published");
    expect(sent()).not.toContain("romane:entry_published");
  });
});

describe("comments", () => {
  let entry: Entry;
  beforeEach(() => {
    entry = mustEntry("publish", { peopleIds: [cast.guest.id, cast.otherPublisher.id] });
    clear();
  });

  it("a comment notifies the author of the entry and the people identified in it", () => {
    mustComment(paulette, entry, "Bravo");
    expect(sent()).toEqual(["marie:entry_comment", "paul:entry_comment", "romane:entry_comment"]);
  });

  it("never notifies the commenter themselves", () => {
    mustComment(cast.guest, entry, "C'était super");
    expect(sent()).toEqual(["paul:entry_comment", "romane:entry_comment"]);
    clear();
    mustComment(cast.publisher, entry, "Merci");
    expect(sent()).toEqual(["marie:entry_comment", "paul:entry_comment"]);
  });

  it("a reply notifies the author of the comment answered, and only them", () => {
    const parent = mustComment(paulette, entry, "Question ?");
    clear();
    mustComment(cast.superuser, entry, "Réponse", parent.id);
    expect(sent()).toEqual(["paulette:comment_reply"]);
  });

  it("a reply to a reply notifies the author of that reply", () => {
    const parent = mustComment(paulette, entry, "Question ?");
    const reply = mustComment(cast.superuser, entry, "Réponse", parent.id);
    clear();
    mustComment(cast.guest, entry, "Réponse à la réponse", reply.id);
    expect(sent()).toEqual(["admin:comment_reply"]);
  });

  it("answering one's own comment notifies nobody", () => {
    const parent = mustComment(paulette, entry, "Question ?");
    clear();
    mustComment(paulette, entry, "Précision", parent.id);
    expect(sent()).toEqual([]);
  });

  it("describes the comment and leads to it", () => {
    const comment = mustComment(paulette, entry, "Bravo   pour\ncette journée");
    const [forRomane] = inbox(cast.publisher);
    const [forMarie] = inbox(cast.guest);
    expect(forRomane).toMatchObject({ excerpt: "Bravo pour cette journée", isOwnEntry: true });
    expect(forRomane?.href).toBe(`/trips/${trip.slug}/entries/${entry.id}#comment-${comment.id}`);
    expect(sentence(forRomane!)).toBe("paulette a commenté votre entrée « Première baignade ».");
    expect(sentence(forMarie!)).toBe(
      "paulette a commenté « Première baignade », une entrée où vous apparaissez.",
    );

    const reply = mustComment(cast.publisher, entry, "x".repeat(300), comment.id);
    const [replyNotice] = inbox(paulette);
    expect(replyNotice?.href).toBe(`/trips/${trip.slug}/entries/${entry.id}#comment-${reply.id}`);
    expect(replyNotice?.excerpt).toHaveLength(120);
    expect(sentence(replyNotice!)).toBe("romane a répondu à votre commentaire sur « Première baignade ».");
  });

  it("disappear when the comment is deleted", () => {
    const lonely = mustComment(paulette, entry, "Seul");
    const parent = mustComment(paulette, entry, "Avec réponse");
    mustComment(cast.guest, entry, "Réponse", parent.id);
    expect(inbox(cast.publisher)).toHaveLength(2);

    deleteComment(db, paulette, lonely.id); // removed for good
    deleteComment(db, paulette, parent.id); // kept as a "deleted" placeholder
    expect(inbox(cast.publisher)).toEqual([]);
    // The reply still exists: the notification about it stays.
    expect(inbox(paulette).map((notice) => notice.excerpt)).toEqual(["Réponse"]);
  });
});

describe("reactions", () => {
  let entry: Entry;
  beforeEach(() => {
    entry = mustEntry("publish");
    clear();
  });

  it("a reaction on an entry notifies its author and the people identified in it, never the person reacting", () => {
    react(db, paulette, { entryId: entry.id }, "love");
    expect(sent()).toEqual(["marie:entry_reaction", "romane:entry_reaction"]);
    clear();
    react(db, cast.guest, { entryId: entry.id }, "love");
    expect(sent()).toEqual(["romane:entry_reaction"]);
  });

  it("changing a reaction updates the notification instead of sending a new one", () => {
    react(db, paulette, { entryId: entry.id }, "like");
    react(db, paulette, { entryId: entry.id }, "haha");
    expect(sent()).toEqual(["marie:entry_reaction", "romane:entry_reaction"]);
    expect(inbox(cast.publisher)[0]?.reactionType).toBe("haha");
    expect(sentence(inbox(cast.publisher)[0]!)).toBe("paulette a réagi 😆 à votre entrée « Première baignade ».");
  });

  it("removing a reaction removes its notification", () => {
    react(db, paulette, { entryId: entry.id }, "wow");
    react(db, paulette, { entryId: entry.id }, "wow");
    expect(sent()).toEqual([]);
  });

  it("removing one person's reaction leaves the others' notifications", () => {
    react(db, paulette, { entryId: entry.id }, "wow");
    react(db, cast.superuser, { entryId: entry.id }, "like");
    react(db, paulette, { entryId: entry.id }, "wow");
    expect(sent()).toEqual(["marie:entry_reaction", "romane:entry_reaction"]);
    expect(inbox(cast.publisher)[0]?.actorName).toBe("admin");
  });

  it("a reaction on a comment notifies the author of that comment only", () => {
    const comment = mustComment(paulette, entry, "Avis");
    clear();
    react(db, cast.superuser, { commentId: comment.id }, "sad");
    expect(sent()).toEqual(["paulette:comment_reaction"]);
    const [notice] = inbox(paulette);
    expect(notice?.href).toBe(`/trips/${trip.slug}/entries/${entry.id}#comment-${comment.id}`);
    expect(sentence(notice!)).toBe("admin a réagi 😢 à votre commentaire sur « Première baignade ».");

    react(db, cast.superuser, { commentId: comment.id }, "sad");
    expect(sent()).toEqual([]);
  });

  it("reacting to one's own comment notifies nobody", () => {
    const comment = mustComment(paulette, entry, "Avis");
    clear();
    react(db, paulette, { commentId: comment.id }, "like");
    expect(sent()).toEqual([]);
  });
});

describe("visibility of notifications", () => {
  it("are never sent about a hidden trip to people who cannot see it", () => {
    const hidden = mustTrip(tripOwner, { title: "Caché", isVisible: false });
    // Identifying people in a hidden trip does not give them access.
    const entry = mustEntry("publish", { peopleIds: [cast.guest.id, cast.superuser.id] }, tripOwner, hidden);
    clear();
    mustComment(cast.superuser, entry, "Chut");
    react(db, cast.superuser, { entryId: entry.id }, "like");
    expect(sent()).toEqual(["chloe:entry_comment", "chloe:entry_reaction"]);
  });

  it("disappear while the trip is hidden, and come back when it is visible again", () => {
    const entry = mustEntry("publish");
    expect(countUnreadNotifications(db, cast.guest)).toBe(1);

    updateTrip(db, cast.superuser, trip.id, tripInput({ isVisible: false }));
    expect(inbox(cast.guest)).toEqual([]);
    expect(countUnreadNotifications(db, cast.guest)).toBe(0);
    const id = db.select().from(notifications).where(eq(notifications.recipientId, cast.guest.id)).get()!.id;
    expect(markNotificationRead(db, cast.guest, id)).toEqual({ ok: false, reason: "not_found" });

    updateTrip(db, cast.superuser, trip.id, tripInput({ isVisible: true }));
    expect(inbox(cast.guest).map((notice) => notice.entryTitle)).toEqual([entry.title]);
  });

  it("disappear while the entry is unpublished", () => {
    const entry = mustEntry("publish");
    updateEntry(db, cast.publisher, entry.id, entryInput({ peopleIds: [cast.guest.id] }), "unpublish");
    expect(inbox(cast.guest)).toEqual([]);
  });

  it("are deleted with the entry, and with the account of the person who acted", () => {
    const entry = mustEntry("publish");
    mustComment(paulette, entry, "Avis");
    expect(sent().length).toBeGreaterThan(0);

    deleteUser(db, cast.superuser, paulette.id);
    expect(sent().some((row) => row.startsWith("romane:entry_comment"))).toBe(false);

    deleteEntry(db, cast.publisher, entry.id);
    expect(sent()).toEqual([]);
  });

  it("are shown to nobody but their recipient", () => {
    mustEntry("publish");
    const forMarie = inbox(cast.guest)[0]!;
    expect(markNotificationRead(db, cast.otherPublisher, forMarie.id)).toEqual({ ok: false, reason: "not_found" });
    expect(markNotificationRead(db, null, forMarie.id)).toEqual({ ok: false, reason: "not_found" });
    expect(inbox(null)).toEqual([]);
    expect(countUnreadNotifications(db, null)).toBe(0);
    expect(inbox(cast.guest)[0]?.isRead).toBe(false);
  });

  it("are hidden from deactivated accounts and accounts awaiting a password change", () => {
    mustEntry("publish");
    for (const actor of [{ ...cast.guest, isActive: false }, { ...cast.guest, mustChangePassword: true }]) {
      expect(inbox(actor)).toEqual([]);
      expect(countUnreadNotifications(db, actor)).toBe(0);
    }
    expect(inbox(cast.guest)).toHaveLength(1);
  });
});

describe("reading notifications", () => {
  it("lists the newest first, with a count of unread ones", () => {
    const first = mustEntry("publish", { title: "Premier" });
    mustEntry("publish", { title: "Second" });
    mustComment(cast.otherPublisher, first, "Avis");
    expect(inbox(cast.guest).map((notice) => [notice.type, notice.entryTitle])).toEqual([
      ["entry_comment", "Premier"],
      ["entry_published", "Second"],
      ["entry_published", "Premier"],
    ]);
    expect(countUnreadNotifications(db, cast.guest)).toBe(3);
  });

  it("marks one notification as read and gives where it leads", () => {
    const entry = mustEntry("publish");
    const [notice] = inbox(cast.guest);
    expect(markNotificationRead(db, cast.guest, notice!.id)).toEqual({
      ok: true,
      href: `/trips/${trip.slug}/entries/${entry.id}`,
    });
    expect(inbox(cast.guest)[0]?.isRead).toBe(true);
    expect(countUnreadNotifications(db, cast.guest)).toBe(0);
    // Marking it again is harmless.
    expect(markNotificationRead(db, cast.guest, notice!.id).ok).toBe(true);
  });

  it("marks all notifications as read at once, without touching other people's", () => {
    mustEntry("publish", { title: "A" });
    mustEntry("publish", { title: "B" });
    expect(markAllNotificationsRead(db, cast.guest)).toBe(2);
    expect(countUnreadNotifications(db, cast.guest)).toBe(0);
    expect(countUnreadNotifications(db, cast.otherPublisher)).toBe(2);
    expect(markAllNotificationsRead(db, null)).toBe(0);
  });
});
