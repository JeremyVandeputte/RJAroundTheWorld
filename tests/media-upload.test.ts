import fs from "node:fs";
import path from "node:path";
import { eq, isNotNull } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { media, users } from "@/server/db/schema";
import { removeEntryDirs, removeFiles, STALE_UPLOAD_MS } from "@/server/media/storage";
import { continueUpload, MAX_CHUNK_BYTES, startUpload, type UploadConfig, type UploadResult } from "@/server/media/upload";
import type { Actor } from "@/server/permissions";
import { createEntry, deleteEntry, updateEntry, type Entry } from "@/server/services/entries";
import {
  deleteMedia,
  getMediaForViewing,
  getMediaUsage,
  listCoverPhotos,
  listEntryMedia,
  MAX_MEDIA_PER_ENTRY,
} from "@/server/services/media";
import { createTrip, deleteTrip, updateTrip, type Trip } from "@/server/services/trips";
import { entryInput, insertCast, insertUser, tripInput, makeTrip } from "./helpers/fixtures";
import { createMediaConfig, listFiles, removeMediaDir, samplePhoto, sampleVideo } from "./helpers/media";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let tripOwner: SessionUser;
let config: UploadConfig;
let trip: Trip;
let entry: Entry;
let photoBytes: Uint8Array;

function mustTrip(actor: Actor, overrides = {}): Trip {
  return makeTrip(db, actor, overrides);
}

function mustEntry(actor: Actor, inTrip: Trip, intent: "save" | "publish"): Entry {
  const result = createEntry(db, actor, inTrip.id, entryInput({ peopleIds: [cast.guest.id] }), intent);
  if (!result.ok) throw new Error(result.reason);
  return result.entry;
}

/** Uploads a whole file in one request and returns its media. */
async function upload(actor: Actor, target: Entry, kind: "photo" | "video", bytes: Uint8Array) {
  const result = await startUpload(db, config, actor, target.id, { kind, size: bytes.byteLength }, bytes);
  if (!result.ok || result.status !== "complete") throw new Error(`upload failed: ${JSON.stringify(result)}`);
  return result.media;
}

const tmpFiles = () => listFiles(path.join(config.mediaDir, ".tmp"));
const storedFiles = () => listFiles(config.mediaDir).filter((file) => !file.startsWith(".tmp/"));

beforeEach(async () => {
  db = createTestDb();
  cast = insertCast(db);
  tripOwner = insertUser(db, "chloe", { canPublish: true, canManageTrips: true });
  config = createMediaConfig();
  trip = mustTrip(cast.superuser);
  entry = mustEntry(cast.publisher, trip, "publish");
  photoBytes = await samplePhoto({ width: 2400, height: 1600, withExif: true });
});
afterEach(() => removeMediaDir(config));

describe("uploading a photo", () => {
  it("stores a resized photo and its thumbnail on disk, and only metadata in the database", async () => {
    const item = await upload(cast.publisher, entry, "photo", photoBytes);
    expect(item).toMatchObject({ kind: "photo", width: 2000, height: 1333 });
    expect(item.publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const row = db.select().from(media).where(isNotNull(media.entryId)).get();
    expect(row).toMatchObject({
      entryId: entry.id,
      uploaderId: cast.publisher.id,
      filePath: `${entry.id}/${item.publicId}.jpg`,
      thumbPath: `${entry.id}/${item.publicId}_thumb.jpg`,
      mimeType: "image/jpeg",
      exifTakenAt: "2026-11-11T10:20:30",
    });
    expect(row?.exifLat).toBeCloseTo(14.6036, 3);
    expect(storedFiles().sort()).toEqual([row!.filePath, row!.thumbPath!].sort());
    expect(row?.sizeBytes).toBe(storedFiles().reduce((total, file) => total + fs.statSync(path.join(config.mediaDir, file)).size, 0));
    // The original upload is not kept, and no temporary file remains.
    expect(tmpFiles()).toEqual([]);
    expect((await sharp(path.join(config.mediaDir, row!.filePath)).metadata()).exif).toBeUndefined();
  });

  it("refuses a file that is not an image and stores nothing", async () => {
    const bytes = new TextEncoder().encode("this is not a photo");
    const result = await startUpload(db, config, cast.publisher, entry.id, { kind: "photo", size: bytes.byteLength }, bytes);
    expect(result).toEqual({ ok: false, reason: "unsupported_image" });
    expect(db.select().from(media).where(isNotNull(media.entryId)).all()).toHaveLength(0);
    expect(listFiles(config.mediaDir)).toEqual([]);
  });

  it("keeps upload order", async () => {
    const first = await upload(cast.publisher, entry, "photo", photoBytes);
    const second = await upload(cast.publisher, entry, "video", sampleVideo(3000));
    const third = await upload(cast.publisher, entry, "photo", photoBytes);
    expect(listEntryMedia(db, cast.guest, trip, entry).map((item) => item.publicId)).toEqual([
      first.publicId,
      second.publicId,
      third.publicId,
    ]);
    // The cover is the first photo, never a video.
    expect(listCoverPhotos(db, [entry.id]).get(entry.id)?.publicId).toBe(first.publicId);
    expect(listCoverPhotos(db, [])).toEqual(new Map());
  });
});

describe("uploading in chunks", () => {
  const video = sampleVideo(2500);
  const chunks = [video.slice(0, 1000), video.slice(1000, 2000), video.slice(2000)];

  async function begin(actor: Actor = cast.publisher) {
    const started = await startUpload(db, config, actor, entry.id, { kind: "video", size: video.byteLength }, chunks[0]!);
    if (!started.ok || started.status !== "partial") throw new Error(JSON.stringify(started));
    return started.uploadId;
  }

  it("assembles the chunks into the exact original file", async () => {
    const uploadId = await begin();
    const second = await continueUpload(db, config, cast.publisher, uploadId, 1000, chunks[1]!);
    expect(second).toEqual({ ok: true, status: "partial", uploadId, received: 2000 });
    expect(db.select().from(media).where(isNotNull(media.entryId)).all()).toHaveLength(0);

    const last = await continueUpload(db, config, cast.publisher, uploadId, 2000, chunks[2]!);
    expect(last).toMatchObject({ ok: true, status: "complete", media: { kind: "video" } });

    const row = db.select().from(media).where(isNotNull(media.entryId)).get()!;
    expect(row).toMatchObject({ kind: "video", mimeType: "video/mp4", sizeBytes: 2500, thumbPath: null });
    expect(new Uint8Array(fs.readFileSync(path.join(config.mediaDir, row.filePath)))).toEqual(video);
    expect(tmpFiles()).toEqual([]);
  });

  it("tells the client where to resume when a chunk arrives at the wrong offset", async () => {
    const uploadId = await begin();
    // The same chunk sent twice (the first answer was lost), then a chunk sent too early.
    expect(await continueUpload(db, config, cast.publisher, uploadId, 0, chunks[0]!)).toEqual({
      ok: false,
      reason: "offset_mismatch",
      received: 1000,
    });
    expect(await continueUpload(db, config, cast.publisher, uploadId, 2000, chunks[2]!)).toEqual({
      ok: false,
      reason: "offset_mismatch",
      received: 1000,
    });
    // Nothing was corrupted: the upload continues normally.
    await continueUpload(db, config, cast.publisher, uploadId, 1000, chunks[1]!);
    const last = await continueUpload(db, config, cast.publisher, uploadId, 2000, chunks[2]!);
    expect(last.ok && last.status).toBe("complete");
    const row = db.select().from(media).where(isNotNull(media.entryId)).get()!;
    expect(new Uint8Array(fs.readFileSync(path.join(config.mediaDir, row.filePath)))).toEqual(video);
  });

  it("never lets two requests write to the same upload at once", async () => {
    const uploadId = await begin();
    const results = await Promise.all([
      continueUpload(db, config, cast.publisher, uploadId, 1000, chunks[1]!),
      continueUpload(db, config, cast.publisher, uploadId, 1000, chunks[1]!),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "offset_mismatch", received: 2000 }]);
  });

  it("ties an upload to the account that started it", async () => {
    const uploadId = await begin();
    for (const actor of [null, cast.guest, cast.otherPublisher, cast.superuser]) {
      expect(await continueUpload(db, config, actor, uploadId, 1000, chunks[1]!)).toEqual({
        ok: false,
        reason: "upload_not_found",
      });
    }
    expect((await continueUpload(db, config, cast.publisher, uploadId, 1000, chunks[1]!)).ok).toBe(true);
  });

  it("rejects unknown or malformed upload identifiers", async () => {
    for (const uploadId of ["unknown", "../../etc/passwd", "a".repeat(32), ""]) {
      expect(await continueUpload(db, config, cast.publisher, uploadId, 0, chunks[0]!)).toEqual({
        ok: false,
        reason: "upload_not_found",
      });
    }
  });

  it("drops an upload that receives more data than announced", async () => {
    const uploadId = await begin();
    const tooMuch = new Uint8Array(1600);
    expect(await continueUpload(db, config, cast.publisher, uploadId, 1000, tooMuch)).toEqual({ ok: false, reason: "too_large" });
    expect(tmpFiles()).toEqual([]);
    expect(await continueUpload(db, config, cast.publisher, uploadId, 1000, chunks[1]!)).toEqual({
      ok: false,
      reason: "upload_not_found",
    });
  });

  it("stops an upload when the uploader loses the right to edit the entry", async () => {
    const uploadId = await begin();
    const demoted = { ...cast.publisher, canPublish: false };
    expect(await continueUpload(db, config, demoted, uploadId, 1000, chunks[1]!)).toEqual({ ok: false, reason: "forbidden" });
    expect(tmpFiles()).toEqual([]);
    expect(db.select().from(media).where(isNotNull(media.entryId)).all()).toHaveLength(0);
  });

  it("refuses a video that is not a video once the last chunk has arrived", async () => {
    const fake = new Uint8Array(2000).fill(65);
    const started = await startUpload(db, config, cast.publisher, entry.id, { kind: "video", size: 2000 }, fake.slice(0, 1000));
    if (!started.ok || started.status !== "partial") throw new Error("unexpected");
    expect(await continueUpload(db, config, cast.publisher, started.uploadId, 1000, fake.slice(1000))).toEqual({
      ok: false,
      reason: "unsupported_video",
    });
    expect(listFiles(config.mediaDir)).toEqual([]);
  });

  it("removes temporary files of uploads abandoned for more than a day", async () => {
    await begin();
    expect(tmpFiles()).toHaveLength(2);
    const old = new Date(Date.now() - STALE_UPLOAD_MS - 60_000);
    for (const file of tmpFiles()) fs.utimesSync(path.join(config.mediaDir, ".tmp", file), old, old);

    // Starting any new upload triggers the cleanup.
    await upload(cast.publisher, entry, "photo", photoBytes);
    expect(tmpFiles()).toEqual([]);
  });

  it("validates sizes, offsets and chunk sizes", async () => {
    const invalid: Promise<UploadResult>[] = [
      startUpload(db, config, cast.publisher, entry.id, { kind: "photo", size: 0 }, photoBytes),
      startUpload(db, config, cast.publisher, entry.id, { kind: "photo", size: Number.NaN }, photoBytes),
      startUpload(db, config, cast.publisher, entry.id, { kind: "photo", size: 1.5 }, photoBytes),
      startUpload(db, config, cast.publisher, entry.id, { kind: "photo", size: 100 }, new Uint8Array(0)),
      continueUpload(db, config, cast.publisher, "x", -1, photoBytes),
    ];
    for (const result of await Promise.all(invalid)) expect(result).toEqual({ ok: false, reason: "invalid_request" });

    const huge = new Uint8Array(MAX_CHUNK_BYTES + 1);
    expect(await startUpload(db, config, cast.publisher, entry.id, { kind: "video", size: huge.byteLength * 2 }, huge)).toEqual({
      ok: false,
      reason: "chunk_too_large",
    });
    // First chunk larger than the announced size.
    expect(await startUpload(db, config, cast.publisher, entry.id, { kind: "video", size: 10 }, sampleVideo(500))).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(listFiles(config.mediaDir)).toEqual([]);
  });
});

describe("who can upload", () => {
  const attempt = (actor: Actor, target: Entry) =>
    startUpload(db, config, actor, target.id, { kind: "photo", size: photoBytes.byteLength }, photoBytes);

  it("lets the author and the superuser add media to an entry", async () => {
    expect((await attempt(cast.publisher, entry)).ok).toBe(true);
    expect((await attempt(cast.superuser, entry)).ok).toBe(true);
    expect(db.select().from(media).where(isNotNull(media.entryId)).all().map((row) => row.uploaderId)).toEqual([cast.publisher.id, cast.superuser.id]);
  });

  it("refuses everyone else", async () => {
    for (const actor of [cast.guest, cast.otherPublisher, cast.manager]) {
      expect(await attempt(actor, entry)).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(await attempt(null, entry)).toEqual({ ok: false, reason: "not_found" });
    expect(await attempt({ ...cast.publisher, canPublish: false }, entry)).toEqual({ ok: false, reason: "forbidden" });
    // An account that must first change its password sees nothing at all.
    expect(await attempt({ ...cast.publisher, mustChangePassword: true }, entry)).toEqual({ ok: false, reason: "not_found" });
    expect(listFiles(config.mediaDir)).toEqual([]);
  });

  it("does not reveal drafts, hidden trips or unknown entries", async () => {
    const draft = mustEntry(cast.publisher, trip, "save");
    const hiddenTrip = mustTrip(tripOwner, { title: "Caché", isVisible: false });
    const hiddenEntry = mustEntry(tripOwner, hiddenTrip, "publish");

    expect(await attempt(cast.otherPublisher, draft)).toEqual({ ok: false, reason: "not_found" });
    expect(await attempt(cast.publisher, hiddenEntry)).toEqual({ ok: false, reason: "not_found" });
    expect(await attempt(null, hiddenEntry)).toEqual({ ok: false, reason: "not_found" });
    expect(await startUpload(db, config, cast.superuser, 9999, { kind: "photo", size: 10 }, photoBytes)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await attempt(tripOwner, hiddenEntry)).ok).toBe(true);
  });
});

describe("limits", () => {
  it("applies a different size limit to photos and videos", async () => {
    config = { ...config, maxPhotoBytes: 1000, maxVideoBytes: 5000 };
    const start = (kind: "photo" | "video", size: number) =>
      startUpload(db, config, cast.publisher, entry.id, { kind, size }, sampleVideo(Math.min(size, 500)));

    expect(await start("photo", 1001)).toEqual({ ok: false, reason: "too_large" });
    expect(await start("video", 5001)).toEqual({ ok: false, reason: "too_large" });
    expect((await start("video", 1001)).ok).toBe(true);
    expect((await start("video", 5000)).ok).toBe(true);
  });

  it("refuses uploads beyond the total quota", async () => {
    await upload(cast.publisher, entry, "video", sampleVideo(6000));
    expect(getMediaUsage(db)).toBe(6000);

    config = { ...config, mediaQuotaBytes: 10_000 };
    const start = (size: number) => startUpload(db, config, cast.publisher, entry.id, { kind: "video", size }, sampleVideo(size));
    expect(await start(4001)).toEqual({ ok: false, reason: "quota_exceeded" });
    expect((await start(4000)).ok).toBe(true);
    expect(getMediaUsage(db)).toBe(10_000);
    expect(await start(1)).toEqual({ ok: false, reason: "quota_exceeded" });
  });

  it("counts space freed by deletions", async () => {
    config = { ...config, mediaQuotaBytes: 5000 };
    const item = await upload(cast.publisher, entry, "video", sampleVideo(5000));
    deleteMedia(db, cast.publisher, item.publicId);
    expect(getMediaUsage(db)).toBe(0);
    expect((await startUpload(db, config, cast.publisher, entry.id, { kind: "video", size: 5000 }, sampleVideo(5000))).ok).toBe(true);
  });

  it("caps the number of files per entry", async () => {
    const rows = Array.from({ length: MAX_MEDIA_PER_ENTRY }, (_, index) => ({
      publicId: `fake-${index}`,
      entryId: entry.id,
      uploaderId: cast.publisher.id,
      kind: "photo" as const,
      filePath: `x/${index}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1,
      position: index,
    }));
    db.insert(media).values(rows).run();
    expect(await startUpload(db, config, cast.publisher, entry.id, { kind: "photo", size: photoBytes.byteLength }, photoBytes)).toEqual({
      ok: false,
      reason: "too_many",
    });
  });
});

describe("who can see a media file", () => {
  it("follows the entry: a published entry of a visible trip is readable by every logged-in account", async () => {
    const item = await upload(cast.publisher, entry, "photo", photoBytes);
    // Never without an account, even with the secret link.
    expect(getMediaForViewing(db, null, item.publicId)).toBeNull();
    expect(listEntryMedia(db, null, trip, entry)).toEqual([]);
    for (const actor of [cast.guest, cast.otherPublisher, cast.superuser]) {
      expect(getMediaForViewing(db, actor, item.publicId)?.publicId).toBe(item.publicId);
      expect(listEntryMedia(db, actor, trip, entry)).toHaveLength(1);
    }
    expect(getMediaForViewing(db, null, "does-not-exist")).toBeNull();
  });

  it("hides the media of a draft from everyone but its author and the superuser", async () => {
    const draft = mustEntry(cast.publisher, trip, "save");
    const item = await upload(cast.publisher, draft, "photo", photoBytes);
    for (const actor of [null, cast.guest, cast.otherPublisher]) {
      expect(getMediaForViewing(db, actor, item.publicId)).toBeNull();
      expect(listEntryMedia(db, actor, trip, draft)).toEqual([]);
    }
    expect(getMediaForViewing(db, cast.publisher, item.publicId)).not.toBeNull();
    expect(getMediaForViewing(db, cast.superuser, item.publicId)).not.toBeNull();
  });

  it("hides media again when the entry is unpublished", async () => {
    const item = await upload(cast.publisher, entry, "photo", photoBytes);
    updateEntry(db, cast.publisher, entry.id, entryInput({ peopleIds: [cast.guest.id] }), "unpublish");
    expect(getMediaForViewing(db, null, item.publicId)).toBeNull();
    expect(getMediaForViewing(db, cast.guest, item.publicId)).toBeNull();
  });

  it("hides the media of a hidden trip from everyone but the trip's creator and the superuser", async () => {
    const hiddenTrip = mustTrip(tripOwner, { title: "Caché", isVisible: false });
    const hiddenEntry = mustEntry(tripOwner, hiddenTrip, "publish");
    const item = await upload(tripOwner, hiddenEntry, "photo", photoBytes);

    for (const actor of [null, cast.guest, cast.publisher, cast.manager]) {
      expect(getMediaForViewing(db, actor, item.publicId)).toBeNull();
    }
    expect(getMediaForViewing(db, tripOwner, item.publicId)).not.toBeNull();
    expect(getMediaForViewing(db, cast.superuser, item.publicId)).not.toBeNull();

    // Revealing the trip reveals its media at once; hiding it again hides them.
    updateTrip(db, tripOwner, hiddenTrip.id, tripInput({ title: "Caché", isVisible: true }));
    expect(getMediaForViewing(db, cast.guest, item.publicId)).not.toBeNull();
    updateTrip(db, tripOwner, hiddenTrip.id, tripInput({ title: "Caché", isVisible: false }));
    expect(getMediaForViewing(db, null, item.publicId)).toBeNull();
  });

  it("does not list media through another trip", async () => {
    await upload(cast.publisher, entry, "photo", photoBytes);
    const otherTrip = mustTrip(cast.superuser, { title: "Autre" });
    expect(listEntryMedia(db, cast.superuser, otherTrip, entry)).toEqual([]);
  });

  it("hides media from deactivated accounts as from any visitor", async () => {
    const draft = mustEntry(cast.publisher, trip, "save");
    const item = await upload(cast.publisher, draft, "photo", photoBytes);
    db.update(users).set({ isActive: false }).where(eq(users.id, cast.publisher.id)).run();
    expect(getMediaForViewing(db, { ...cast.publisher, isActive: false }, item.publicId)).toBeNull();
  });
});

describe("deleting media", () => {
  it("is reserved to the author of the entry and the superuser", async () => {
    const item = await upload(cast.publisher, entry, "photo", photoBytes);
    for (const actor of [cast.guest, cast.otherPublisher]) {
      expect(deleteMedia(db, actor, item.publicId)).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(deleteMedia(db, null, item.publicId)).toEqual({ ok: false, reason: "not_found" });
    expect(db.select().from(media).where(isNotNull(media.entryId)).all()).toHaveLength(1);
    expect(deleteMedia(db, cast.superuser, item.publicId).ok).toBe(true);
    expect(deleteMedia(db, cast.superuser, item.publicId)).toEqual({ ok: false, reason: "not_found" });
  });

  it("removes the photo and its thumbnail from disk", async () => {
    const kept = await upload(cast.publisher, entry, "photo", photoBytes);
    const removed = await upload(cast.publisher, entry, "photo", photoBytes);
    const result = deleteMedia(db, cast.publisher, removed.publicId);
    if (!result.ok) throw new Error(result.reason);
    await removeFiles(config.mediaDir, result.files);

    expect(storedFiles().sort()).toEqual([`${entry.id}/${kept.publicId}.jpg`, `${entry.id}/${kept.publicId}_thumb.jpg`]);
  });

  it("removes every file when the entry is deleted", async () => {
    const other = mustEntry(cast.publisher, trip, "publish");
    await upload(cast.publisher, entry, "photo", photoBytes);
    await upload(cast.publisher, entry, "video", sampleVideo(2000));
    const kept = await upload(cast.publisher, other, "photo", photoBytes);

    expect(deleteEntry(db, cast.publisher, entry.id).ok).toBe(true);
    await removeEntryDirs(config.mediaDir, [entry.id]);

    expect(db.select().from(media).where(isNotNull(media.entryId)).all().map((row) => row.publicId)).toEqual([kept.publicId]);
    expect(storedFiles().every((file) => file.startsWith(`${other.id}/`))).toBe(true);
    expect(storedFiles()).toHaveLength(2);
  });

  it("removes every file of every entry when the trip is deleted", async () => {
    const second = mustEntry(cast.publisher, trip, "save");
    await upload(cast.publisher, entry, "photo", photoBytes);
    await upload(cast.publisher, second, "photo", photoBytes);

    const result = deleteTrip(db, cast.superuser, trip.id);
    if (!result.ok) throw new Error(result.reason);
    expect(result.entryIds.sort()).toEqual([entry.id, second.id].sort());
    await removeEntryDirs(config.mediaDir, result.entryIds);

    expect(db.select().from(media).where(isNotNull(media.entryId)).all()).toHaveLength(0);
    expect(storedFiles()).toEqual([]);
    expect(getMediaUsage(db)).toBe(0);
  });
});
