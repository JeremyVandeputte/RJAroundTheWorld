import { describe, expect, it } from "vitest";
import {
  canBeNotifiedAbout,
  canComment,
  canCreateEntry,
  canDeleteComment,
  canEditComment,
  canEditEntry,
  canManageTrips,
  canManageUsers,
  canReact,
  canViewEntry,
  canViewSocial,
  canViewTrip,
  type Actor,
  type PermissionUser,
} from "@/server/permissions";

function user(id: number, overrides: Partial<PermissionUser> = {}): PermissionUser {
  return {
    id,
    role: "user",
    canPublish: false,
    canComment: true,
    canReact: true,
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

// The cast of characters.
const anonymous: Actor = null;
const guest = user(1); // default account: Commenter + Réagir
const readOnly = user(2, { canComment: false, canReact: false });
const publisher = user(3, { canPublish: true });
const otherPublisher = user(4, { canPublish: true });
const superuser = user(5, { role: "superuser", canPublish: true });
const deactivated = user(6, { canPublish: true, isActive: false });
const mustChange = user(7, { canPublish: true, mustChangePassword: true });
const lockedSuperuser = user(8, { role: "superuser", mustChangePassword: true });

const everyone = { anonymous, guest, readOnly, publisher, otherPublisher, superuser, deactivated, mustChange, lockedSuperuser };
type Name = keyof typeof everyone;

/** Asserts that exactly the listed actors are allowed. */
function expectAllowed(check: (actor: Actor) => boolean, allowed: Name[]) {
  for (const [name, actor] of Object.entries(everyone)) {
    expect(check(actor), name).toBe(allowed.includes(name as Name));
  }
}

const visibleTrip = { isVisible: true };
const hiddenTrip = { isVisible: false };
const published = { authorId: publisher.id, status: "published" } as const;
const draft = { authorId: publisher.id, status: "draft" } as const;

describe("administration", () => {
  it("is reserved to the superuser", () => {
    expectAllowed(canManageUsers, ["superuser"]);
    expectAllowed(canManageTrips, ["superuser"]);
  });
});

describe("trip visibility", () => {
  it("shows a visible trip to everyone, including anonymous visitors", () => {
    expectAllowed((actor) => canViewTrip(actor, visibleTrip), Object.keys(everyone) as Name[]);
  });

  it("shows a hidden trip only to the superuser and to users with Publier", () => {
    expectAllowed((actor) => canViewTrip(actor, hiddenTrip), ["publisher", "otherPublisher", "superuser"]);
  });
});

describe("entry visibility", () => {
  it("shows a published entry of a visible trip to everyone", () => {
    expectAllowed((actor) => canViewEntry(actor, visibleTrip, published), Object.keys(everyone) as Name[]);
  });

  it("hides every entry of a hidden trip, even published, from those who cannot see the trip", () => {
    expectAllowed((actor) => canViewEntry(actor, hiddenTrip, published), ["publisher", "otherPublisher", "superuser"]);
  });

  it("shows a draft only to its author and to the superuser", () => {
    expectAllowed((actor) => canViewEntry(actor, visibleTrip, draft), ["publisher", "superuser"]);
    expectAllowed((actor) => canViewEntry(actor, hiddenTrip, draft), ["publisher", "superuser"]);
  });

  it("hides an author's own draft once they can no longer see its hidden trip", () => {
    const formerPublisher = { ...publisher, canPublish: false };
    expect(canViewEntry(formerPublisher, hiddenTrip, draft)).toBe(false);
    expect(canViewEntry(formerPublisher, visibleTrip, draft)).toBe(true);
  });
});

describe("writing entries", () => {
  it("requires Publier (or superuser) to create an entry", () => {
    expectAllowed((actor) => canCreateEntry(actor, visibleTrip), ["publisher", "otherPublisher", "superuser"]);
    expectAllowed((actor) => canCreateEntry(actor, hiddenTrip), ["publisher", "otherPublisher", "superuser"]);
  });

  it("lets only the author (with Publier) and the superuser edit an entry", () => {
    for (const entry of [published, draft]) {
      expectAllowed((actor) => canEditEntry(actor, visibleTrip, entry), ["publisher", "superuser"]);
      expectAllowed((actor) => canEditEntry(actor, hiddenTrip, entry), ["publisher", "superuser"]);
    }
  });

  it("stops an author from editing once Publier is removed", () => {
    expect(canEditEntry({ ...publisher, canPublish: false }, visibleTrip, published)).toBe(false);
  });
});

describe("comments and reactions", () => {
  it("are invisible to anonymous visitors, even as counts", () => {
    expectAllowed(
      (actor) => canViewSocial(actor, visibleTrip, published),
      ["guest", "readOnly", "publisher", "otherPublisher", "superuser"],
    );
  });

  it("follow the visibility of the trip", () => {
    expectAllowed((actor) => canViewSocial(actor, hiddenTrip, published), ["publisher", "otherPublisher", "superuser"]);
  });

  it("do not exist on drafts", () => {
    expectAllowed((actor) => canViewSocial(actor, visibleTrip, draft), []);
    expectAllowed((actor) => canComment(actor, visibleTrip, draft), []);
    expectAllowed((actor) => canReact(actor, visibleTrip, draft), []);
  });

  it("require the Commenter permission to comment", () => {
    expectAllowed(
      (actor) => canComment(actor, visibleTrip, published),
      ["guest", "publisher", "otherPublisher", "superuser"],
    );
    expect(canComment({ ...guest, canComment: false }, visibleTrip, published)).toBe(false);
    // The superuser can always comment, whatever the flags say.
    expect(canComment({ ...superuser, canComment: false }, visibleTrip, published)).toBe(true);
  });

  it("require the Réagir permission to react", () => {
    expectAllowed(
      (actor) => canReact(actor, visibleTrip, published),
      ["guest", "publisher", "otherPublisher", "superuser"],
    );
    expect(canReact({ ...guest, canReact: false }, visibleTrip, published)).toBe(false);
  });

  it("refuse comments and reactions on a hidden trip to users who cannot see it", () => {
    expectAllowed((actor) => canComment(actor, hiddenTrip, published), ["publisher", "otherPublisher", "superuser"]);
    expectAllowed((actor) => canReact(actor, hiddenTrip, published), ["publisher", "otherPublisher", "superuser"]);
  });

  it("let users change only their own comments, and the superuser any comment", () => {
    const guestComment = { authorId: guest.id, deletedAt: null };
    for (const check of [canEditComment, canDeleteComment]) {
      expectAllowed((actor) => check(actor, visibleTrip, published, guestComment), ["guest", "superuser"]);
    }
  });

  it("stop users from changing their comments once Commenter is removed", () => {
    const guestComment = { authorId: guest.id, deletedAt: null };
    const muted = { ...guest, canComment: false };
    expect(canEditComment(muted, visibleTrip, published, guestComment)).toBe(false);
    expect(canDeleteComment(muted, visibleTrip, published, guestComment)).toBe(false);
  });

  it("freeze deleted comments and comments of deleted accounts", () => {
    const deleted = { authorId: guest.id, deletedAt: new Date() };
    expectAllowed((actor) => canEditComment(actor, visibleTrip, published, deleted), []);
    const orphan = { authorId: null, deletedAt: null };
    expectAllowed((actor) => canDeleteComment(actor, visibleTrip, published, orphan), ["superuser"]);
  });
});

describe("notifications", () => {
  it("are only created for users who can see the entry", () => {
    expect(canBeNotifiedAbout(guest, visibleTrip, published)).toBe(true);
    expect(canBeNotifiedAbout(guest, hiddenTrip, published)).toBe(false);
    expect(canBeNotifiedAbout(publisher, hiddenTrip, published)).toBe(true);
    expect(canBeNotifiedAbout(superuser, hiddenTrip, published)).toBe(true);
    expect(canBeNotifiedAbout(guest, visibleTrip, draft)).toBe(false);
  });

  it("skip deactivated accounts but not accounts waiting for a password change", () => {
    expect(canBeNotifiedAbout(deactivated, visibleTrip, published)).toBe(false);
    expect(canBeNotifiedAbout(mustChange, hiddenTrip, published)).toBe(true);
  });
});

describe("restricted accounts", () => {
  it("give a deactivated account or one awaiting a password change no more than an anonymous visitor", () => {
    for (const actor of [deactivated, mustChange, lockedSuperuser]) {
      expect(canViewTrip(actor, hiddenTrip)).toBe(false);
      expect(canCreateEntry(actor, visibleTrip)).toBe(false);
      expect(canViewSocial(actor, visibleTrip, published)).toBe(false);
      expect(canManageUsers(actor)).toBe(false);
      // Public content stays readable, exactly as for a visitor with the link.
      expect(canViewEntry(actor, visibleTrip, published)).toBe(true);
    }
  });
});
