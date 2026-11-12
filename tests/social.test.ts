import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { comments, reactions } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { addComment, deleteComment, editComment, listCommentThreads, type Comment } from "@/server/services/comments";
import { createEntry, deleteEntry, updateEntry, type Entry } from "@/server/services/entries";
import { getEntryReactions, react } from "@/server/services/reactions";
import { createTrip, updateTrip, type Trip } from "@/server/services/trips";
import { entryInput, insertCast, insertUser, tripInput } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let tripOwner: SessionUser;
let muted: SessionUser; // an account with neither Commenter nor Réagir
let trip: Trip;
let entry: Entry;
let hiddenTrip: Trip;
let hiddenEntry: Entry;
let draft: Entry;

function mustTrip(actor: Actor, overrides = {}): Trip {
  const result = createTrip(db, actor, tripInput(overrides));
  if (!result.ok) throw new Error(result.reason);
  return result.trip;
}
function mustEntry(actor: Actor, inTrip: Trip, intent: "save" | "publish"): Entry {
  const result = createEntry(db, actor, inTrip.id, entryInput({ peopleIds: [cast.guest.id] }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}
function mustComment(actor: Actor, body: string, replyToId: number | null = null, target: Entry = entry): Comment {
  const result = addComment(db, actor, target.id, { body, replyToId });
  if (!result.ok) throw new Error(result.reason);
  return result.comment;
}
const threads = (actor: Actor, inTrip: Trip = trip, target: Entry = entry) => listCommentThreads(db, actor, inTrip, target);
/** Compact picture of the threads: "body[reply, reply]". */
const outline = (actor: Actor) =>
  threads(actor)?.map((thread) => `${thread.isDeleted ? "(supprimé)" : thread.body}[${thread.replies.map((reply) => reply.body).join(", ")}]`);
const stored = (id: number) => db.select().from(comments).where(eq(comments.id, id)).get();

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  tripOwner = insertUser(db, "chloe", { canPublish: true, canManageTrips: true });
  muted = insertUser(db, "leo", { canComment: false, canReact: false });
  trip = mustTrip(cast.superuser);
  entry = mustEntry(cast.publisher, trip, "publish");
  draft = mustEntry(cast.publisher, trip, "save");
  hiddenTrip = mustTrip(tripOwner, { title: "Caché", isVisible: false });
  hiddenEntry = mustEntry(tripOwner, hiddenTrip, "publish");
});

describe("who can see comments and reactions", () => {
  beforeEach(() => {
    mustComment(cast.guest, "Superbe !");
    react(db, cast.guest, { entryId: entry.id }, "love");
  });

  it("shows nothing to visitors without an account, not even counts", () => {
    expect(threads(null)).toBeNull();
    expect(getEntryReactions(db, null, trip, entry)).toBeNull();
  });

  it("shows them to every logged-in user, even without Commenter or Réagir", () => {
    for (const actor of [cast.guest, muted, cast.publisher, cast.superuser]) {
      expect(threads(actor)).toHaveLength(1);
      expect(getEntryReactions(db, actor, trip, entry)?.entry.counts.love).toBe(1);
    }
  });

  it("shows nothing to deactivated accounts or accounts awaiting a password change", () => {
    for (const actor of [{ ...cast.guest, isActive: false }, { ...cast.guest, mustChangePassword: true }]) {
      expect(threads(actor)).toBeNull();
      expect(getEntryReactions(db, actor, trip, entry)).toBeNull();
    }
  });

  it("hides them with a hidden trip, except from its creator and the superuser", () => {
    mustComment(tripOwner, "Chut", null, hiddenEntry);
    for (const actor of [null, cast.guest, cast.publisher, cast.manager]) {
      expect(threads(actor, hiddenTrip, hiddenEntry)).toBeNull();
      expect(getEntryReactions(db, actor, hiddenTrip, hiddenEntry)).toBeNull();
    }
    expect(threads(tripOwner, hiddenTrip, hiddenEntry)).toHaveLength(1);
    expect(threads(cast.superuser, hiddenTrip, hiddenEntry)).toHaveLength(1);
  });

  it("hides them when the entry is unpublished, and shows them again when republished", () => {
    updateEntry(db, cast.publisher, entry.id, entryInput({ peopleIds: [cast.guest.id] }), "unpublish");
    const unpublished = { ...entry, status: "draft" as const };
    expect(threads(cast.guest, trip, unpublished)).toBeNull();
    expect(threads(cast.publisher, trip, unpublished)).toBeNull();
    updateEntry(db, cast.publisher, entry.id, entryInput({ peopleIds: [cast.guest.id] }), "publish");
    expect(threads(cast.guest)).toHaveLength(1);
  });

  it("never lists comments through another trip's entry", () => {
    expect(threads(cast.superuser, hiddenTrip, entry)).toBeNull();
  });
});

describe("posting comments", () => {
  it("requires the Commenter permission", () => {
    for (const actor of [null, muted]) {
      expect(addComment(db, actor, entry.id, { body: "Bonjour", replyToId: null })).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(addComment(db, { ...cast.guest, canComment: false }, entry.id, { body: "x", replyToId: null })).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(db.select().from(comments).all()).toHaveLength(0);
    expect(addComment(db, cast.guest, entry.id, { body: "Bonjour", replyToId: null }).ok).toBe(true);
    // The superuser can always comment.
    expect(addComment(db, { ...cast.superuser, canComment: false }, entry.id, { body: "Bonjour", replyToId: null }).ok).toBe(true);
  });

  it("is impossible on drafts, hidden trips and unknown entries, without revealing them", () => {
    const attempt = (actor: Actor, target: number) => addComment(db, actor, target, { body: "x", replyToId: null });
    expect(attempt(cast.guest, draft.id)).toEqual({ ok: false, reason: "not_found" });
    expect(attempt(cast.publisher, draft.id)).toEqual({ ok: false, reason: "forbidden" });
    expect(attempt(cast.guest, hiddenEntry.id)).toEqual({ ok: false, reason: "not_found" });
    expect(attempt(cast.publisher, hiddenEntry.id)).toEqual({ ok: false, reason: "not_found" });
    expect(attempt(cast.guest, 9999)).toEqual({ ok: false, reason: "not_found" });
    expect(attempt(tripOwner, hiddenEntry.id).ok).toBe(true);
  });

  it("stores the text as typed and validates its length", () => {
    const attempt = (body: string) => addComment(db, cast.guest, entry.id, { body, replyToId: null });
    expect(attempt("   ")).toEqual({ ok: false, reason: "invalid_body" });
    expect(attempt("x".repeat(2001))).toEqual({ ok: false, reason: "invalid_body" });
    expect(attempt("x".repeat(2000)).ok).toBe(true);
    const html = attempt("  <script>alert(1)</script>\r\nligne 2  ");
    expect(html.ok && html.comment.body).toBe("<script>alert(1)</script>\nligne 2");
  });

  it("records the author and shows their display name", () => {
    mustComment(cast.guest, "Bonjour");
    expect(threads(cast.publisher)?.[0]).toMatchObject({ authorName: "marie", body: "Bonjour", isDeleted: false, editedAt: null });
  });
});

describe("replies (a single nesting level)", () => {
  it("attaches a reply to the comment it answers", () => {
    const parent = mustComment(cast.guest, "Parent");
    const reply = mustComment(cast.publisher, "Réponse", parent.id);
    expect(reply.parentId).toBe(parent.id);
    expect(outline(cast.guest)).toEqual(["Parent[Réponse]"]);
  });

  it("puts a reply to a reply at the same level, under the same parent", () => {
    const parent = mustComment(cast.guest, "Parent");
    const first = mustComment(cast.publisher, "Réponse 1", parent.id);
    const second = mustComment(cast.guest, "Réponse à la réponse", first.id);
    expect(second.parentId).toBe(parent.id);
    mustComment(cast.otherPublisher, "Autre fil");
    expect(outline(cast.guest)).toEqual(["Parent[Réponse 1, Réponse à la réponse]", "Autre fil[]"]);
  });

  it("reports which comment was answered, for notifications", () => {
    const parent = mustComment(cast.guest, "Parent");
    const first = mustComment(cast.publisher, "Réponse 1", parent.id);
    const result = addComment(db, cast.otherPublisher, entry.id, { body: "Réponse 2", replyToId: first.id });
    expect(result.ok && result.repliedTo?.id).toBe(first.id);
    const topLevel = addComment(db, cast.guest, entry.id, { body: "Nouveau", replyToId: null });
    expect(topLevel.ok && topLevel.repliedTo).toBeNull();
  });

  it("refuses to answer an unknown comment or one from another entry", () => {
    const other = mustEntry(cast.publisher, trip, "publish");
    const elsewhere = mustComment(cast.guest, "Ailleurs", null, other);
    for (const replyToId of [9999, elsewhere.id]) {
      expect(addComment(db, cast.guest, entry.id, { body: "x", replyToId })).toEqual({ ok: false, reason: "comment_not_found" });
    }
  });
});

describe("editing comments", () => {
  let comment: Comment;
  beforeEach(() => {
    comment = mustComment(cast.guest, "Premier jet");
  });

  it("lets users edit only their own comments", () => {
    for (const actor of [null, muted, cast.publisher, cast.otherPublisher]) {
      const result = editComment(db, actor, comment.id, "Piraté");
      expect(result.ok).toBe(false);
    }
    expect(stored(comment.id)?.body).toBe("Premier jet");

    const edited = editComment(db, cast.guest, comment.id, "  Corrigé  ");
    expect(edited.ok && edited.comment).toMatchObject({ body: "Corrigé" });
    expect(threads(cast.publisher)?.[0]?.editedAt).toBeInstanceOf(Date);
  });

  it("lets the superuser edit any comment", () => {
    expect(editComment(db, cast.superuser, comment.id, "Modéré").ok).toBe(true);
    expect(stored(comment.id)).toMatchObject({ body: "Modéré", authorId: cast.guest.id });
  });

  it("stops users from editing once Commenter is removed", () => {
    expect(editComment(db, { ...cast.guest, canComment: false }, comment.id, "Encore")).toEqual({ ok: false, reason: "forbidden" });
  });

  it("validates the new text", () => {
    expect(editComment(db, cast.guest, comment.id, " ")).toEqual({ ok: false, reason: "invalid_body" });
    expect(editComment(db, cast.guest, 9999, "x")).toEqual({ ok: false, reason: "comment_not_found" });
  });

  it("tells each viewer what they may do with each comment", () => {
    const flags = (actor: Actor) => {
      const view = threads(actor)?.[0];
      return [view?.canEdit, view?.canDelete];
    };
    expect(flags(cast.guest)).toEqual([true, true]);
    expect(flags(cast.superuser)).toEqual([true, true]);
    expect(flags(cast.publisher)).toEqual([false, false]);
    expect(flags(muted)).toEqual([false, false]);
  });
});

describe("deleting comments", () => {
  it("lets users delete only their own comments, and the superuser any", () => {
    const comment = mustComment(cast.guest, "À supprimer");
    for (const actor of [null, muted, cast.publisher]) {
      expect(deleteComment(db, actor, comment.id).ok).toBe(false);
    }
    expect(stored(comment.id)).toBeDefined();
    expect(deleteComment(db, cast.guest, comment.id).ok).toBe(true);
    expect(stored(comment.id)).toBeUndefined();

    const other = mustComment(cast.guest, "Modération");
    expect(deleteComment(db, cast.superuser, other.id).ok).toBe(true);
    expect(db.select().from(comments).all()).toHaveLength(0);
  });

  it("the author of the entry cannot delete other people's comments on it", () => {
    const comment = mustComment(cast.guest, "Avis");
    expect(deleteComment(db, cast.publisher, comment.id)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("keeps a placeholder when the deleted comment has replies, so the thread survives", () => {
    const parent = mustComment(cast.guest, "Parent");
    mustComment(cast.publisher, "Réponse", parent.id);
    react(db, cast.publisher, { commentId: parent.id }, "like");

    expect(deleteComment(db, cast.guest, parent.id).ok).toBe(true);

    expect(outline(cast.publisher)).toEqual(["(supprimé)[Réponse]"]);
    const placeholder = threads(cast.publisher)?.[0];
    expect(placeholder).toMatchObject({ isDeleted: true, body: "", authorName: null, canEdit: false, canDelete: false });
    // Its text is really gone from the database, and so are its reactions.
    expect(stored(parent.id)).toMatchObject({ body: "" });
    expect(db.select().from(reactions).all()).toHaveLength(0);
  });

  it("freezes a deleted comment: no edit, no second deletion, no reaction, no direct answer", () => {
    const parent = mustComment(cast.guest, "Parent");
    const reply = mustComment(cast.publisher, "Réponse", parent.id);
    deleteComment(db, cast.guest, parent.id);

    expect(editComment(db, cast.guest, parent.id, "Retour")).toEqual({ ok: false, reason: "comment_not_found" });
    expect(deleteComment(db, cast.superuser, parent.id)).toEqual({ ok: false, reason: "comment_not_found" });
    expect(react(db, cast.guest, { commentId: parent.id }, "like")).toEqual({ ok: false, reason: "not_found" });
    expect(addComment(db, cast.guest, entry.id, { body: "x", replyToId: parent.id })).toEqual({
      ok: false,
      reason: "comment_not_found",
    });
    // The thread itself stays alive: its replies can still be answered.
    expect(mustComment(cast.guest, "Suite", reply.id).parentId).toBe(parent.id);
    expect(outline(cast.guest)).toEqual(["(supprimé)[Réponse, Suite]"]);
  });

  it("removes the placeholder with its last reply", () => {
    const parent = mustComment(cast.guest, "Parent");
    const first = mustComment(cast.publisher, "Réponse 1", parent.id);
    const second = mustComment(cast.publisher, "Réponse 2", parent.id);
    deleteComment(db, cast.guest, parent.id);

    deleteComment(db, cast.publisher, first.id);
    expect(outline(cast.guest)).toEqual(["(supprimé)[Réponse 2]"]);
    deleteComment(db, cast.publisher, second.id);
    expect(outline(cast.guest)).toEqual([]);
    expect(db.select().from(comments).all()).toHaveLength(0);
  });

  it("deletes a reply without touching the rest of the thread", () => {
    const parent = mustComment(cast.guest, "Parent");
    const reply = mustComment(cast.publisher, "Réponse", parent.id);
    mustComment(cast.guest, "Autre réponse", parent.id);
    expect(deleteComment(db, cast.publisher, reply.id).ok).toBe(true);
    expect(outline(cast.guest)).toEqual(["Parent[Autre réponse]"]);
  });

  it("removes comments and reactions with their entry", () => {
    const comment = mustComment(cast.guest, "Avis");
    react(db, cast.guest, { entryId: entry.id }, "like");
    react(db, cast.publisher, { commentId: comment.id }, "haha");
    deleteEntry(db, cast.publisher, entry.id);
    expect(db.select().from(comments).all()).toHaveLength(0);
    expect(db.select().from(reactions).all()).toHaveLength(0);
  });
});

describe("reactions", () => {
  const summary = (actor: Actor = cast.guest) => getEntryReactions(db, actor, trip, entry)!;

  it("require the Réagir permission", () => {
    for (const actor of [null, muted, { ...cast.guest, canReact: false }]) {
      expect(react(db, actor, { entryId: entry.id }, "like")).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(db.select().from(reactions).all()).toHaveLength(0);
    expect(react(db, cast.guest, { entryId: entry.id }, "like")).toMatchObject({ ok: true, change: "added" });
  });

  it("accept exactly the six reaction types", () => {
    for (const type of ["like", "love", "haha", "wow", "sad", "angry"]) {
      const user = insertUser(db, `user-${type}`);
      expect(react(db, user, { entryId: entry.id }, type).ok).toBe(true);
    }
    expect(Object.values(summary().entry.counts)).toEqual([1, 1, 1, 1, 1, 1]);
    for (const type of ["dislike", "", "LIKE", "like "]) {
      expect(react(db, cast.guest, { entryId: entry.id }, type)).toEqual({ ok: false, reason: "invalid_type" });
    }
  });

  it("allow one reaction per user and per element: a new choice replaces the old one", () => {
    react(db, cast.guest, { entryId: entry.id }, "like");
    expect(react(db, cast.guest, { entryId: entry.id }, "love")).toMatchObject({ ok: true, change: "changed" });
    expect(db.select().from(reactions).all()).toHaveLength(1);
    expect(summary().entry.counts).toMatchObject({ like: 0, love: 1 });
    expect(summary().entry.mine).toBe("love");
  });

  it("remove the reaction when the same type is chosen again", () => {
    react(db, cast.guest, { entryId: entry.id }, "wow");
    expect(react(db, cast.guest, { entryId: entry.id }, "wow")).toMatchObject({ ok: true, change: "removed" });
    expect(db.select().from(reactions).all()).toHaveLength(0);
    expect(summary().entry.mine).toBeNull();
  });

  it("are independent on the entry and on each comment or reply", () => {
    const comment = mustComment(cast.publisher, "Avis");
    const reply = mustComment(cast.guest, "Réponse", comment.id);
    react(db, cast.guest, { entryId: entry.id }, "like");
    react(db, cast.guest, { commentId: comment.id }, "haha");
    react(db, cast.guest, { commentId: reply.id }, "sad");
    react(db, cast.publisher, { commentId: comment.id }, "haha");

    const all = summary();
    expect(all.entry.counts.like).toBe(1);
    expect(all.comments.get(comment.id)).toMatchObject({ mine: "haha", counts: { haha: 2 } });
    expect(all.comments.get(reply.id)?.counts.sad).toBe(1);
    expect(db.select().from(reactions).all()).toHaveLength(4);
  });

  it("show every logged-in user the counts and who reacted what, and each viewer their own choice", () => {
    react(db, cast.guest, { entryId: entry.id }, "love");
    react(db, cast.publisher, { entryId: entry.id }, "love");
    react(db, cast.superuser, { entryId: entry.id }, "wow");

    const seenByMuted = summary(muted).entry;
    expect(seenByMuted.counts).toMatchObject({ love: 2, wow: 1, like: 0 });
    expect(seenByMuted.people).toEqual([
      { name: "marie", type: "love" },
      { name: "romane", type: "love" },
      { name: "admin", type: "wow" },
    ]);
    expect(seenByMuted.mine).toBeNull();
    expect(summary(cast.publisher).entry.mine).toBe("love");
    expect(summary(cast.superuser).entry.mine).toBe("wow");
  });

  it("are impossible on drafts, hidden trips and unknown elements, without revealing them", () => {
    expect(react(db, cast.guest, { entryId: draft.id }, "like")).toEqual({ ok: false, reason: "not_found" });
    expect(react(db, cast.publisher, { entryId: draft.id }, "like")).toEqual({ ok: false, reason: "forbidden" });
    expect(react(db, cast.guest, { entryId: hiddenEntry.id }, "like")).toEqual({ ok: false, reason: "not_found" });
    expect(react(db, cast.guest, { entryId: 9999 }, "like")).toEqual({ ok: false, reason: "not_found" });
    expect(react(db, cast.guest, { commentId: 9999 }, "like")).toEqual({ ok: false, reason: "not_found" });

    const secret = mustComment(tripOwner, "Chut", null, hiddenEntry);
    expect(react(db, cast.guest, { commentId: secret.id }, "like")).toEqual({ ok: false, reason: "not_found" });
    expect(react(db, tripOwner, { commentId: secret.id }, "like").ok).toBe(true);
  });

  it("disappear from view when their trip is hidden, and come back with it", () => {
    react(db, cast.guest, { entryId: entry.id }, "like");
    const hidden = updateTrip(db, cast.superuser, trip.id, tripInput({ isVisible: false }));
    if (!hidden.ok) throw new Error(hidden.reason);
    expect(getEntryReactions(db, cast.guest, hidden.trip, entry)).toBeNull();
    expect(react(db, cast.guest, { entryId: entry.id }, "love")).toEqual({ ok: false, reason: "not_found" });
    const shown = updateTrip(db, cast.superuser, trip.id, tripInput({ isVisible: true }));
    expect(shown.ok && getEntryReactions(db, cast.guest, shown.trip, entry)?.entry.counts.like).toBe(1);
  });
});
