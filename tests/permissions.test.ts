import { describe, expect, it } from "vitest";
import {
  canBeNotifiedAbout,
  canComment,
  canCreateEntry,
  canCreateTrip,
  canDeleteComment,
  canEditComment,
  canEditEntry,
  canEditTrip,
  canManageUsers,
  canReact,
  canViewEntry,
  canViewSocial,
  canViewTrip,
  canWriteEntries,
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
    canManageTrips: false,
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
const tripOwner = user(9, { canManageTrips: true, canPublish: true }); // created the hidden trip
const otherManager = user(10, { canManageTrips: true, canPublish: true });

const everyone = {
  anonymous,
  guest,
  readOnly,
  publisher,
  otherPublisher,
  superuser,
  deactivated,
  mustChange,
  lockedSuperuser,
  tripOwner,
  otherManager,
};
type Name = keyof typeof everyone;
const allNames = Object.keys(everyone) as Name[];

/** Asserts that exactly the listed actors are allowed. */
function expectAllowed(check: (actor: Actor) => boolean, allowed: Name[]) {
  for (const [name, actor] of Object.entries(everyone)) {
    expect(check(actor), name).toBe(allowed.includes(name as Name));
  }
}

const visibleTrip = { isVisible: true, authorId: superuser.id };
const hiddenTrip = { isVisible: false, authorId: tripOwner.id };
const ownersVisibleTrip = { isVisible: true, authorId: tripOwner.id };
const orphanTrip = { isVisible: false, authorId: null };
const published = { authorId: publisher.id, status: "published" } as const;
const draft = { authorId: publisher.id, status: "draft" } as const;

describe("administration", () => {
  it("of accounts is reserved to the superuser", () => {
    expectAllowed(canManageUsers, ["superuser"]);
  });
});

describe("trip management", () => {
  it("requires Gérer les voyages (or superuser) to create a trip", () => {
    expectAllowed(canCreateTrip, ["tripOwner", "otherManager", "superuser"]);
    expect(canCreateTrip(publisher)).toBe(false);
  });

  it("lets only the creator of a trip and the superuser edit, hide or delete it", () => {
    for (const trip of [hiddenTrip, ownersVisibleTrip]) {
      expectAllowed((actor) => canEditTrip(actor, trip), ["tripOwner", "superuser"]);
    }
    // A trip created by the superuser: nobody else, not even another manager.
    expectAllowed((actor) => canEditTrip(actor, visibleTrip), ["superuser"]);
  });

  it("stops the creator from changing the trip once Gérer les voyages is removed", () => {
    const former = { ...tripOwner, canManageTrips: false };
    expect(canEditTrip(former, hiddenTrip)).toBe(false);
    expect(canEditTrip(former, ownersVisibleTrip)).toBe(false);
    // The trip is still theirs to see.
    expect(canViewTrip(former, hiddenTrip)).toBe(true);
  });

  it("leaves a trip whose creator was deleted to the superuser alone", () => {
    expectAllowed((actor) => canViewTrip(actor, orphanTrip), ["superuser"]);
    expectAllowed((actor) => canEditTrip(actor, orphanTrip), ["superuser"]);
  });
});

describe("trip visibility", () => {
  it("shows a visible trip to everyone, including anonymous visitors", () => {
    expectAllowed((actor) => canViewTrip(actor, visibleTrip), allNames);
  });

  it("shows a hidden trip only to its creator and to the superuser", () => {
    expectAllowed((actor) => canViewTrip(actor, hiddenTrip), ["tripOwner", "superuser"]);
  });

  it("does not open hidden trips to Publier or Gérer les voyages as such", () => {
    expect(canViewTrip(publisher, hiddenTrip)).toBe(false);
    expect(canViewTrip(otherManager, hiddenTrip)).toBe(false);
  });
});

describe("entry visibility", () => {
  it("shows a published entry of a visible trip to everyone", () => {
    expectAllowed((actor) => canViewEntry(actor, visibleTrip, published), allNames);
  });

  it("hides every entry of a hidden trip, even published, from those who cannot see the trip", () => {
    expectAllowed((actor) => canViewEntry(actor, hiddenTrip, published), ["tripOwner", "superuser"]);
  });

  it("shows a draft only to its author and to the superuser", () => {
    expectAllowed((actor) => canViewEntry(actor, visibleTrip, draft), ["publisher", "superuser"]);
    // Not even the creator of the trip sees someone else's draft.
    expect(canViewEntry(tripOwner, ownersVisibleTrip, draft)).toBe(false);
  });

  it("hides an author's own entries once their trip is hidden by its creator", () => {
    expect(canViewEntry(publisher, hiddenTrip, published)).toBe(false);
    expect(canViewEntry(publisher, hiddenTrip, draft)).toBe(false);
    expect(canEditEntry(publisher, hiddenTrip, published)).toBe(false);
  });
});

describe("writing entries", () => {
  it("requires Publier (or superuser)", () => {
    expectAllowed(canWriteEntries, ["publisher", "otherPublisher", "tripOwner", "otherManager", "superuser"]);
    expectAllowed(
      (actor) => canCreateEntry(actor, visibleTrip),
      ["publisher", "otherPublisher", "tripOwner", "otherManager", "superuser"],
    );
  });

  it("is only possible in a hidden trip for its creator (with Publier) and the superuser", () => {
    expectAllowed((actor) => canCreateEntry(actor, hiddenTrip), ["tripOwner", "superuser"]);
    expect(canCreateEntry({ ...tripOwner, canPublish: false }, hiddenTrip)).toBe(false);
  });

  it("lets only the author (with Publier) and the superuser edit an entry", () => {
    for (const entry of [published, draft]) {
      expectAllowed((actor) => canEditEntry(actor, visibleTrip, entry), ["publisher", "superuser"]);
    }
    // Creating the trip gives no right over other people's entries in it.
    expect(canEditEntry(tripOwner, ownersVisibleTrip, published)).toBe(false);
  });

  it("stops an author from editing once Publier is removed", () => {
    expect(canEditEntry({ ...publisher, canPublish: false }, visibleTrip, published)).toBe(false);
  });
});

describe("comments and reactions", () => {
  const loggedIn: Name[] = ["guest", "readOnly", "publisher", "otherPublisher", "superuser", "tripOwner", "otherManager"];
  const withDefaults: Name[] = ["guest", "publisher", "otherPublisher", "superuser", "tripOwner", "otherManager"];

  it("are invisible to anonymous visitors, even as counts", () => {
    expectAllowed((actor) => canViewSocial(actor, visibleTrip, published), loggedIn);
  });

  it("follow the visibility of the trip", () => {
    expectAllowed((actor) => canViewSocial(actor, hiddenTrip, published), ["tripOwner", "superuser"]);
    expectAllowed((actor) => canComment(actor, hiddenTrip, published), ["tripOwner", "superuser"]);
    expectAllowed((actor) => canReact(actor, hiddenTrip, published), ["tripOwner", "superuser"]);
  });

  it("do not exist on drafts", () => {
    expectAllowed((actor) => canViewSocial(actor, visibleTrip, draft), []);
    expectAllowed((actor) => canComment(actor, visibleTrip, draft), []);
    expectAllowed((actor) => canReact(actor, visibleTrip, draft), []);
  });

  it("require the Commenter permission to comment", () => {
    expectAllowed((actor) => canComment(actor, visibleTrip, published), withDefaults);
    expect(canComment({ ...guest, canComment: false }, visibleTrip, published)).toBe(false);
    // The superuser can always comment, whatever the flags say.
    expect(canComment({ ...superuser, canComment: false }, visibleTrip, published)).toBe(true);
  });

  it("require the Réagir permission to react", () => {
    expectAllowed((actor) => canReact(actor, visibleTrip, published), withDefaults);
    expect(canReact({ ...guest, canReact: false }, visibleTrip, published)).toBe(false);
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
    expect(canBeNotifiedAbout(publisher, hiddenTrip, published)).toBe(false);
    expect(canBeNotifiedAbout(otherManager, hiddenTrip, published)).toBe(false);
    expect(canBeNotifiedAbout(tripOwner, hiddenTrip, published)).toBe(true);
    expect(canBeNotifiedAbout(superuser, hiddenTrip, published)).toBe(true);
    expect(canBeNotifiedAbout(guest, visibleTrip, draft)).toBe(false);
  });

  it("skip deactivated accounts but not accounts waiting for a password change", () => {
    expect(canBeNotifiedAbout(deactivated, visibleTrip, published)).toBe(false);
    expect(canBeNotifiedAbout(mustChange, visibleTrip, published)).toBe(true);
    expect(canBeNotifiedAbout({ ...tripOwner, mustChangePassword: true }, hiddenTrip, published)).toBe(true);
  });
});

describe("restricted accounts", () => {
  it("give a deactivated account or one awaiting a password change no more than an anonymous visitor", () => {
    const lockedOwner = { ...tripOwner, mustChangePassword: true };
    const deactivatedOwner = { ...tripOwner, isActive: false };
    for (const actor of [deactivated, mustChange, lockedSuperuser, lockedOwner, deactivatedOwner]) {
      expect(canViewTrip(actor, hiddenTrip)).toBe(false);
      expect(canEditTrip(actor, hiddenTrip)).toBe(false);
      expect(canCreateTrip(actor)).toBe(false);
      expect(canCreateEntry(actor, visibleTrip)).toBe(false);
      expect(canViewSocial(actor, visibleTrip, published)).toBe(false);
      expect(canManageUsers(actor)).toBe(false);
      // Public content stays readable, exactly as for a visitor with the link.
      expect(canViewEntry(actor, visibleTrip, published)).toBe(true);
    }
  });
});
