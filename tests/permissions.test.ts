import { describe, expect, it } from "vitest";
import {
  canBeNotifiedAbout,
  canCreateEntry,
  canCreateTrip,
  canEditEntry,
  canEditTrip,
  canExportTrip,
  canManageUsers,
  canManageJournal,
  canManageTags,
  canAccessAdmin,
  canViewStats,
  canReadEntryNotification,
  canViewEntry,
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
    canManageTrips: false,
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

// The cast of characters.
const anonymous: Actor = null;
const guest = user(1); // default account: reading only
const readOnly = user(2);
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
/** Accounts that can use the site: logged in, active, password not waiting to be changed. */
const loggedInActive = allNames.filter(
  (name) => !(["anonymous", "deactivated", "mustChange", "lockedSuperuser"] as Name[]).includes(name),
);

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

  it("lets the people who run the journal export the trips they can see", () => {
    const runners: Name[] = ["tripOwner", "otherManager", "superuser"];
    expectAllowed((actor) => canExportTrip(actor, visibleTrip), runners);
    expectAllowed((actor) => canExportTrip(actor, hiddenTrip), ["tripOwner", "superuser"]);
    expect(canExportTrip({ ...tripOwner, canManageTrips: false }, ownersVisibleTrip)).toBe(false);
  });

  it("reserve statistics, tags and the administration page to Publier + Gérer les voyages", () => {
    const runners: Name[] = ["tripOwner", "otherManager", "superuser"];
    expectAllowed(canManageJournal, runners);
    expectAllowed(canViewStats, runners);
    expectAllowed(canManageTags, runners);
    expectAllowed(canAccessAdmin, runners);
    // Accounts stay with the superuser.
    expectAllowed(canManageUsers, ["superuser"]);
    expect(canManageJournal(user(20, { canManageTrips: true }))).toBe(false);
    expect(canManageJournal(user(21, { canPublish: true }))).toBe(false);
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
  it("shows a visible trip to every logged-in account, never to anonymous visitors", () => {
    expectAllowed((actor) => canViewTrip(actor, visibleTrip), loggedInActive);
    expect(canViewTrip(null, visibleTrip)).toBe(false);
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
  it("shows a published entry of a visible trip to every logged-in account only", () => {
    expectAllowed((actor) => canViewEntry(actor, visibleTrip, published), loggedInActive);
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

describe("notifications about an entry", () => {
  const loggedIn: Name[] = ["guest", "readOnly", "publisher", "otherPublisher", "superuser", "tripOwner", "otherManager"];

  it("are only read by logged-in users who can see the published entry", () => {
    expectAllowed((actor) => canReadEntryNotification(actor, visibleTrip, published), loggedIn);
    expectAllowed((actor) => canReadEntryNotification(actor, hiddenTrip, published), ["tripOwner", "superuser"]);
    expectAllowed((actor) => canReadEntryNotification(actor, visibleTrip, draft), []);
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
      expect(canReadEntryNotification(actor, visibleTrip, published)).toBe(false);
      expect(canManageUsers(actor)).toBe(false);
      // Nothing is readable without a usable account.
      expect(canViewEntry(actor, visibleTrip, published)).toBe(false);
    }
  });
});
