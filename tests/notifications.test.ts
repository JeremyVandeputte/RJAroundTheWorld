import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { describeNotification } from "@/lib/notification-text";
import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { notifications, users } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { deleteUser } from "@/server/services/admin";
import { createEntry, deleteEntry, updateEntry, type Entry, type EntryInput } from "@/server/services/entries";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/services/notifications";
import { createTrip, deleteTrip, updateTrip, type Trip } from "@/server/services/trips";
import { entryInput, insertCast, insertUser, tripInput, makeTrip } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let tripOwner: SessionUser;
let paulette: SessionUser; // another guest, identified in nothing
let trip: Trip;

function mustTrip(actor: Actor, overrides = {}): Trip {
  return makeTrip(db, actor, overrides);
}
/** Entry by Romane (publisher), identifying Marie (guest) unless told otherwise. */
function mustEntry(intent: "save" | "publish", overrides: Partial<EntryInput> = {}, actor: Actor = cast.publisher, inTrip: Trip = trip): Entry {
  const result = createEntry(db, actor, inTrip.id, entryInput({ peopleIds: [cast.guest.id], ...overrides }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
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
  // Creating a visible trip announces it: start each test from an empty inbox.
  clear();
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
    const before = sent();
    const input = entryInput({ peopleIds: [cast.guest.id] });
    updateEntry(db, cast.publisher, entry.id, input, "save");
    updateEntry(db, cast.publisher, entry.id, input, "unpublish");
    updateEntry(db, cast.publisher, entry.id, input, "publish");
    expect(sent()).toEqual(before);
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

describe("visibility of notifications", () => {
  it("are never sent about a hidden trip to people who cannot see it", () => {
    const hidden = mustTrip(tripOwner, { title: "Caché", isVisible: false });
    // Identifying people in a hidden trip does not give them access.
    mustEntry("publish", { peopleIds: [cast.guest.id, cast.superuser.id] }, tripOwner, hidden);
    expect(sent()).toEqual(["admin:entry_published"]);
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
    const aboutEntries = inbox(cast.guest).filter((notice) => notice.type !== "trip_revealed");
    expect(aboutEntries.map((notice) => notice.entryTitle)).toEqual([entry.title]);
  });

  it("disappear while the entry is unpublished", () => {
    const entry = mustEntry("publish");
    updateEntry(db, cast.publisher, entry.id, entryInput({ peopleIds: [cast.guest.id] }), "unpublish");
    expect(inbox(cast.guest)).toEqual([]);
  });

  it("are deleted with the entry, and with the account of their recipient", () => {
    const entry = mustEntry("publish");
    expect(sent()).toContain("paulette:entry_published");

    deleteUser(db, cast.superuser, paulette.id);
    expect(sent().some((row) => row.startsWith("paulette:"))).toBe(false);

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
    expect(inbox(cast.guest).map((notice) => [notice.type, notice.entryTitle])).toEqual([
      ["entry_published", "Second"],
      ["entry_published", first.title],
    ]);
    expect(countUnreadNotifications(db, cast.guest)).toBe(2);
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

describe("being identified after publication", () => {
  let entry: Entry;
  const edit = (actor: Actor, peopleIds: number[], intent: "save" | "unpublish" | "publish" = "save") =>
    updateEntry(db, actor, entry.id, entryInput({ peopleIds }), intent);

  beforeEach(() => {
    entry = mustEntry("publish", { peopleIds: [cast.guest.id] });
  });

  it("notifies a person added to a published entry", () => {
    const before = sent();
    edit(cast.publisher, [cast.guest.id, paulette.id]);
    expect(sent()).toEqual([...before, "paulette:entry_tagged"].sort());
    const [notice] = inbox(paulette);
    expect(notice?.href).toBe(`/trips/${trip.slug}/entries/${entry.id}`);
    expect(sentence(notice!)).toBe("romane a indiqué votre présence dans « Première baignade ».");
  });

  it("does not notify again people already told, by the publication or earlier", () => {
    edit(cast.publisher, [cast.guest.id, paulette.id]);
    const before = sent();
    edit(cast.publisher, [cast.guest.id, paulette.id]); // nobody new
    edit(cast.publisher, [cast.guest.id]); // paulette removed...
    edit(cast.publisher, [cast.guest.id, paulette.id]); // ...and added back
    expect(sent()).toEqual(before);
  });

  it("notifies people added while the entry was withdrawn, once it is published again", () => {
    edit(cast.publisher, [cast.guest.id], "unpublish");
    edit(cast.publisher, [cast.guest.id, paulette.id]);
    expect(sent()).not.toContain("paulette:entry_tagged");
    edit(cast.publisher, [cast.guest.id, paulette.id], "publish");
    expect(sent()).toContain("paulette:entry_tagged");
  });

  it("never notifies the person making the change, nor the author", () => {
    const before = sent();
    edit(cast.superuser, [cast.guest.id, cast.superuser.id, cast.publisher.id]);
    expect(sent()).toEqual(before);
  });

  it("respects hidden trips", () => {
    const hidden = mustTrip(tripOwner, { title: "Caché", isVisible: false });
    const secret = mustEntry("publish", { peopleIds: [tripOwner.id] }, tripOwner, hidden);
    const before = sent();
    updateEntry(db, tripOwner, secret.id, entryInput({ peopleIds: [paulette.id, cast.superuser.id] }), "save");
    expect(sent()).toEqual([...before, "admin:entry_tagged"].sort());
  });

  it("goes away when the person is no longer identified", () => {
    edit(cast.publisher, [cast.guest.id, paulette.id]);
    expect(inbox(paulette).map((notice) => notice.type)).toEqual(["entry_tagged", "entry_published"]);
    edit(cast.publisher, [cast.guest.id]);
    expect(inbox(paulette).map((notice) => notice.type)).toEqual(["entry_published"]);
  });

  it("reflects the current identification in other notifications", () => {
    expect(inbox(cast.guest)[0]?.isTagged).toBe(true);
    edit(cast.publisher, [paulette.id]);
    // Marie is no longer identified: her earlier notices no longer say she is.
    expect(inbox(cast.guest).every((notice) => !notice.isTagged)).toBe(true);
  });
});

describe("a trip becoming visible", () => {
  let hidden: Trip;
  const reveal = (actor: Actor, isVisible = true) => updateTrip(db, actor, hidden.id, tripInput({ title: "Surprise", isVisible }));

  beforeEach(() => {
    hidden = mustTrip(tripOwner, { title: "Surprise", isVisible: false });
  });

  it("notifies nobody while it is hidden", () => {
    expect(sent()).toEqual([]);
  });

  it("notifies everyone who can now see it, except the person who revealed it", () => {
    reveal(tripOwner);
    expect(sent()).toEqual(
      ["admin", "lucie", "marie", "paul", "paulette", "romane"].map((name) => `${name}:trip_revealed`),
    );
    const [notice] = inbox(cast.guest);
    expect(notice).toMatchObject({ type: "trip_revealed", entryTitle: null, tripTitle: "Surprise" });
    expect(notice?.href).toBe(`/trips/${hidden.slug}`);
    expect(sentence(notice!)).toBe("chloe a rendu visible le voyage « Surprise ».");
  });

  it("is announced only once, even if the trip is hidden and revealed again", () => {
    reveal(cast.superuser);
    const before = sent();
    reveal(cast.superuser, false);
    reveal(cast.superuser);
    expect(sent()).toEqual(before);
  });

  it("disappears while the trip is hidden again", () => {
    reveal(tripOwner);
    reveal(tripOwner, false);
    expect(inbox(cast.guest)).toEqual([]);
    expect(countUnreadNotifications(db, cast.guest)).toBe(0);
    // The superuser can still see the trip: the notice stays for them.
    expect(inbox(cast.superuser).map((notice) => notice.type)).toEqual(["trip_revealed"]);
  });

  it("does not notify when other details of a visible trip change", () => {
    reveal(tripOwner);
    const before = sent();
    updateTrip(db, tripOwner, hidden.id, tripInput({ title: "Nouveau titre", isVisible: true }));
    expect(sent()).toEqual(before);
  });

  it("applies to a trip created directly visible", () => {
    mustTrip(cast.manager, { title: "Tout de suite" });
    expect(sent()).toHaveLength(6);
    expect(sent()).not.toContain("lucie:trip_revealed");
  });

  it("skips deactivated accounts and is deleted with the trip", () => {
    db.update(users).set({ isActive: false }).where(eq(users.id, paulette.id)).run();
    reveal(tripOwner);
    expect(sent()).not.toContain("paulette:trip_revealed");
    deleteTrip(db, tripOwner, hidden.id);
    expect(sent()).toEqual([]);
  });

  it("can be opened and marked as read", () => {
    reveal(tripOwner);
    const [notice] = inbox(cast.guest);
    expect(markNotificationRead(db, cast.guest, notice!.id)).toEqual({ ok: true, href: `/trips/${hidden.slug}` });
    expect(countUnreadNotifications(db, cast.guest)).toBe(0);
  });
});
