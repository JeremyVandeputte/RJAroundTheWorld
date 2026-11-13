import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { entries, media, trips } from "@/server/db/schema";
import { startTripCoverUpload, startUpload, type UploadConfig } from "@/server/media/upload";
import type { Actor } from "@/server/permissions";
import { createEntry, deleteEntry, updateEntry, type Entry } from "@/server/services/entries";
import {
  chooseEntryCover,
  chooseTripCover,
  deleteMedia,
  getMediaForViewing,
  listCoverPhotos,
  listTripCoverCandidates,
  listTripCovers,
} from "@/server/services/media";
import { createTrip, deleteTrip, updateTrip, type Trip } from "@/server/services/trips";
import { entryInput, insertCast, insertUser, tripInput } from "./helpers/fixtures";
import { createMediaConfig, listFiles, removeMediaDir, samplePhoto, sampleVideo } from "./helpers/media";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let tripOwner: SessionUser;
let config: UploadConfig;
let trip: Trip;
let photo: Uint8Array;

const reload = (id: number) => db.select().from(trips).where(eq(trips.id, id)).get()!;
const coverOf = (id: number) => listTripCovers(db, [reload(id)]).get(id)?.publicId ?? null;

async function uploadTripCover(actor: Actor, tripId: number, bytes: Uint8Array = photo) {
  return startTripCoverUpload(db, config, actor, tripId, bytes.byteLength, bytes);
}
async function uploadToEntry(actor: Actor, entry: Entry, kind: "photo" | "video", bytes: Uint8Array) {
  const result = await startUpload(db, config, actor, entry.id, { kind, size: bytes.byteLength }, bytes);
  if (!result.ok || result.status !== "complete") throw new Error(JSON.stringify(result));
  return result.media.publicId;
}
function mustEntry(intent: "save" | "publish", actor: Actor = tripOwner): Entry {
  const result = createEntry(db, actor, trip.id, entryInput({ peopleIds: [cast.guest.id] }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}

beforeEach(async () => {
  db = createTestDb();
  cast = insertCast(db);
  tripOwner = insertUser(db, "chloe", { canPublish: true, canManageTrips: true });
  config = createMediaConfig();
  const created = createTrip(db, tripOwner, tripInput({ isVisible: false }));
  if (!created.ok) throw new Error(created.reason);
  trip = created.trip;
  photo = await samplePhoto({ width: 1600, height: 900 });
});
afterEach(() => removeMediaDir(config));

describe("uploading a trip's thumbnail", () => {
  it("stores the photo in the trip's folder and makes it the thumbnail", async () => {
    const result = await uploadTripCover(tripOwner, trip.id);
    expect(result).toMatchObject({ ok: true, status: "complete", media: { kind: "photo", width: 1600 } });
    const id = result.ok && result.status === "complete" ? result.media.publicId : "";
    expect(coverOf(trip.id)).toBe(id);
    expect(listFiles(config.mediaDir).sort()).toEqual([`trip-${trip.id}/${id}.jpg`, `trip-${trip.id}/${id}_thumb.jpg`]);
    expect(db.select().from(media).get()).toMatchObject({ tripId: trip.id, entryId: null });
  });

  it("replaces the previous uploaded thumbnail, files included", async () => {
    await uploadTripCover(tripOwner, trip.id);
    const second = await uploadTripCover(tripOwner, trip.id);
    const id = second.ok && second.status === "complete" ? second.media.publicId : "";
    expect(db.select().from(media).all().map((row) => row.publicId)).toEqual([id]);
    expect(listFiles(config.mediaDir)).toHaveLength(2);
  });

  it("is reserved to the trip's creator and the superuser", async () => {
    const otherManager = insertUser(db, "paul2", { canManageTrips: true });
    for (const actor of [cast.guest, cast.publisher, otherManager]) {
      expect(await uploadTripCover(actor, trip.id)).toEqual({ ok: false, reason: "not_found" });
    }
    expect(await uploadTripCover(null, trip.id)).toEqual({ ok: false, reason: "not_found" });
    expect((await uploadTripCover(cast.superuser, trip.id)).ok).toBe(true);

    // On a visible trip, others see it but still cannot change its thumbnail.
    updateTrip(db, tripOwner, trip.id, tripInput({ isVisible: true }));
    expect(await uploadTripCover(cast.guest, trip.id)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("only accepts images, within the photo size limit and the quota", async () => {
    expect(await uploadTripCover(tripOwner, trip.id, sampleVideo(5000))).toEqual({ ok: false, reason: "unsupported_image" });
    config = { ...config, maxPhotoBytes: 100 };
    expect(await uploadTripCover(tripOwner, trip.id)).toEqual({ ok: false, reason: "too_large" });
    config = { ...config, maxPhotoBytes: 10 * 1024 * 1024, mediaQuotaBytes: 100 };
    expect(await uploadTripCover(tripOwner, trip.id)).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(reload(trip.id).coverMediaId).toBeNull();
    expect(listFiles(config.mediaDir)).toEqual([]);
  });

  it("follows the trip's visibility", async () => {
    const result = await uploadTripCover(tripOwner, trip.id);
    const id = result.ok && result.status === "complete" ? result.media.publicId : "";
    for (const actor of [null, cast.guest, cast.publisher]) expect(getMediaForViewing(db, actor, id), String(actor?.username)).toBeNull();
    expect(getMediaForViewing(db, tripOwner, id)).not.toBeNull();
    expect(getMediaForViewing(db, cast.superuser, id)).not.toBeNull();

    updateTrip(db, tripOwner, trip.id, tripInput({ isVisible: true }));
    expect(getMediaForViewing(db, cast.guest, id)).not.toBeNull();
    expect(getMediaForViewing(db, null, id)).toBeNull();
  });

  it("cannot be deleted like an entry's photo: only replaced", async () => {
    const result = await uploadTripCover(tripOwner, trip.id);
    const id = result.ok && result.status === "complete" ? result.media.publicId : "";
    expect(deleteMedia(db, tripOwner, id)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("choosing a trip's thumbnail among its entries' photos", () => {
  it("offers the photos of the trip's entries the creator can see, never videos", async () => {
    const entry = mustEntry("publish");
    const p1 = await uploadToEntry(tripOwner, entry, "photo", photo);
    await uploadToEntry(tripOwner, entry, "video", sampleVideo(3000));
    // A draft written by someone else is not offered to the trip's creator.
    updateTrip(db, tripOwner, trip.id, tripInput({ isVisible: false }));
    expect(listTripCoverCandidates(db, tripOwner, trip).map((item) => item.publicId)).toEqual([p1]);
    expect(listTripCoverCandidates(db, cast.guest, trip)).toEqual([]);
  });

  it("makes the chosen photo the thumbnail and drops a previously uploaded one", async () => {
    await uploadTripCover(tripOwner, trip.id);
    const entry = mustEntry("publish");
    const chosen = await uploadToEntry(tripOwner, entry, "photo", photo);
    const result = chooseTripCover(db, tripOwner, trip.id, chosen);
    expect(result.ok).toBe(true);
    expect(coverOf(trip.id)).toBe(chosen);
    // The uploaded thumbnail and its files are gone; the entry's photo stays.
    expect(db.select().from(media).all().map((row) => row.publicId)).toEqual([chosen]);
    expect(result.ok && result.replacedFiles.filter(Boolean)).toHaveLength(2);
  });

  it("refuses videos, photos of other trips and unauthorised people", async () => {
    const entry = mustEntry("publish");
    const video = await uploadToEntry(tripOwner, entry, "video", sampleVideo(3000));
    expect(chooseTripCover(db, tripOwner, trip.id, video)).toEqual({ ok: false, reason: "not_a_photo" });

    const other = createTrip(db, cast.superuser, tripInput({ title: "Autre", isVisible: false }));
    if (!other.ok) throw new Error(other.reason);
    const elsewhere = createEntry(db, cast.superuser, other.trip.id, entryInput({ peopleIds: [cast.guest.id] }), "publish");
    if (!elsewhere.ok) throw new Error(elsewhere.reason);
    const foreign = await uploadToEntry(cast.superuser, elsewhere.entry, "photo", photo);
    expect(chooseTripCover(db, cast.superuser, trip.id, foreign)).toEqual({ ok: false, reason: "not_found" });

    const own = await uploadToEntry(tripOwner, entry, "photo", photo);
    expect(chooseTripCover(db, cast.guest, trip.id, own)).toEqual({ ok: false, reason: "not_found" });
    expect(reload(trip.id).coverMediaId).toBeNull();
  });

  it("shows a photo of a draft chosen as thumbnail wherever the trip is shown", async () => {
    const draft = mustEntry("save");
    const chosen = await uploadToEntry(tripOwner, draft, "photo", photo);
    chooseTripCover(db, tripOwner, trip.id, chosen);
    updateTrip(db, tripOwner, trip.id, tripInput({ isVisible: true }));
    // The draft itself stays private, but its photo is now the trip's thumbnail.
    expect(getMediaForViewing(db, cast.guest, chosen)).not.toBeNull();
    expect(getMediaForViewing(db, null, chosen)).toBeNull();
  });

  it("is cleared when the chosen photo is deleted, and the trip stays as it is", async () => {
    const entry = mustEntry("publish");
    const chosen = await uploadToEntry(tripOwner, entry, "photo", photo);
    chooseTripCover(db, tripOwner, trip.id, chosen);
    updateTrip(db, tripOwner, trip.id, tripInput({ isVisible: true }));
    deleteMedia(db, tripOwner, chosen);
    expect(reload(trip.id)).toMatchObject({ coverMediaId: null, isVisible: true });
  });
});

describe("an entry's thumbnail", () => {
  let entry: Entry;
  let first: string;
  let second: string;

  beforeEach(async () => {
    entry = mustEntry("publish");
    first = await uploadToEntry(tripOwner, entry, "photo", photo);
    second = await uploadToEntry(tripOwner, entry, "photo", photo);
  });

  it("is the first photo until the author chooses another one", () => {
    expect(listCoverPhotos(db, [entry.id]).get(entry.id)?.publicId).toBe(first);
    expect(chooseEntryCover(db, tripOwner, second)).toEqual({ ok: true, replacedFiles: [] });
    expect(listCoverPhotos(db, [entry.id]).get(entry.id)?.publicId).toBe(second);
  });

  it("can be chosen only by the author and the superuser, and only among photos", async () => {
    chooseTripCover(db, tripOwner, trip.id, first);
    expect(updateTrip(db, tripOwner, trip.id, tripInput({ isVisible: true })).ok).toBe(true);
    expect(chooseEntryCover(db, cast.guest, second)).toEqual({ ok: false, reason: "forbidden" });
    expect(chooseEntryCover(db, null, second)).toEqual({ ok: false, reason: "not_found" });
    expect(chooseEntryCover(db, cast.superuser, second).ok).toBe(true);
    const video = await uploadToEntry(tripOwner, entry, "video", sampleVideo(3000));
    expect(chooseEntryCover(db, tripOwner, video)).toEqual({ ok: false, reason: "not_a_photo" });
  });

  it("falls back to the first photo when the chosen one is deleted", () => {
    chooseEntryCover(db, tripOwner, second);
    deleteMedia(db, tripOwner, second);
    expect(db.select().from(entries).where(eq(entries.id, entry.id)).get()?.coverMediaId).toBeNull();
    expect(listCoverPhotos(db, [entry.id]).get(entry.id)?.publicId).toBe(first);
  });

  it("is unaffected by editing the entry", () => {
    chooseEntryCover(db, tripOwner, second);
    updateEntry(db, tripOwner, entry.id, entryInput({ peopleIds: [cast.guest.id], title: "Nouveau titre" }), "save");
    expect(listCoverPhotos(db, [entry.id]).get(entry.id)?.publicId).toBe(second);
  });
});

describe("deleting", () => {
  it("a trip removes its uploaded thumbnail along with its entries", async () => {
    await uploadTripCover(tripOwner, trip.id);
    const entry = mustEntry("publish");
    await uploadToEntry(tripOwner, entry, "photo", photo);
    const result = deleteTrip(db, tripOwner, trip.id);
    expect(result.ok).toBe(true);
    expect(db.select().from(media).all()).toHaveLength(0);
  });

  it("an entry whose photo is the trip's thumbnail leaves the trip without one", async () => {
    const entry = mustEntry("publish");
    const chosen = await uploadToEntry(tripOwner, entry, "photo", photo);
    chooseTripCover(db, tripOwner, trip.id, chosen);
    deleteEntry(db, tripOwner, entry.id);
    expect(reload(trip.id).coverMediaId).toBeNull();
    expect(fs.existsSync(path.join(config.mediaDir, `trip-${trip.id}`))).toBe(false);
  });
});
