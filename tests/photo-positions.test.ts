import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareCaptureTime, type PhotoPosition } from "@/lib/photo-position";
import type { Db } from "@/server/db/client";
import { media } from "@/server/db/schema";
import { uploadResponse } from "@/server/media/http";
import { startUpload, type UploadConfig } from "@/server/media/upload";
import { createEntry, type Entry } from "@/server/services/entries";
import { listEntryPhotoPositions } from "@/server/services/media";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip } from "./helpers/fixtures";
import { createMediaConfig, removeMediaDir, samplePhoto, sampleVideo } from "./helpers/media";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let config: UploadConfig;
let trip: Trip;
let entry: Entry;
let counter = 0;

/** A photo row of the entry (no file), with or without GPS data. */
function addPhoto(fields: { lat?: number; lng?: number; takenAt?: string; kind?: "photo" | "video" } = {}) {
  counter += 1;
  const publicId = `photo-${counter}`.padEnd(22, "x");
  db.insert(media)
    .values({
      publicId,
      entryId: entry.id,
      uploaderId: cast.publisher.id,
      kind: fields.kind ?? "photo",
      filePath: `${entry.id}/${publicId}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 0,
      position: counter,
      exifLat: fields.lat ?? null,
      exifLng: fields.lng ?? null,
      exifTakenAt: fields.takenAt ?? null,
    })
    .run();
  return publicId;
}

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  config = createMediaConfig();
  trip = makeTrip(db, cast.superuser);
  const created = createEntry(db, cast.publisher, trip.id, entryInput({ peopleIds: [cast.guest.id] }), "save");
  if (!created.ok) throw new Error(created.reason);
  entry = created.entry;
});
afterEach(() => removeMediaDir(config));

describe("positions of an entry's photos", () => {
  it("lists photos with a GPS position, oldest first, those without a capture time last", () => {
    const late = addPhoto({ lat: 14.7, lng: -61.1, takenAt: "2026-11-11T17:00:00" });
    const undated = addPhoto({ lat: 14.5, lng: -61 });
    addPhoto({ takenAt: "2026-11-11T08:00:00" }); // no position
    addPhoto({ kind: "video" });
    const early = addPhoto({ lat: 14.6, lng: -61.05, takenAt: "2026-11-11T09:00:00" });

    const positions = listEntryPhotoPositions(db, cast.publisher, trip, entry);
    expect(positions.map((position) => position.publicId)).toEqual([early, late, undated]);
    expect(positions[0]).toEqual({ publicId: early, lat: 14.6, lng: -61.05, takenAt: "2026-11-11T09:00:00" });
  });

  it("are only given to people who can edit the entry", () => {
    addPhoto({ lat: 14.6, lng: -61 });
    expect(listEntryPhotoPositions(db, cast.publisher, trip, entry)).toHaveLength(1);
    expect(listEntryPhotoPositions(db, cast.superuser, trip, entry)).toHaveLength(1);
    expect(listEntryPhotoPositions(db, cast.otherPublisher, trip, entry)).toEqual([]);
    expect(listEntryPhotoPositions(db, cast.guest, trip, entry)).toEqual([]);
    expect(listEntryPhotoPositions(db, null, trip, entry)).toEqual([]);
  });

  it("ignore an entry looked up through another trip", () => {
    addPhoto({ lat: 14.6, lng: -61 });
    const other = makeTrip(db, cast.superuser, { title: "Islande" });
    expect(listEntryPhotoPositions(db, cast.publisher, other, entry)).toEqual([]);
  });
});

describe("sending a photo", () => {
  it("gives its author the GPS position read from the photo", async () => {
    const bytes = await samplePhoto({ width: 800, height: 600, withExif: true });
    const result = await startUpload(db, config, cast.publisher, entry.id, { kind: "photo", size: bytes.byteLength }, bytes);
    if (!result.ok || result.status !== "complete") throw new Error(JSON.stringify(result));
    expect(result.position?.publicId).toBe(result.media.publicId);
    expect(result.position?.lat).toBeCloseTo(14.6036, 3);
    expect(result.position?.lng).toBeCloseTo(-61.0742, 3);
    expect(result.position?.takenAt).toBe("2026-11-11T10:20:30");

    const body = await uploadResponse(result, "photo").json();
    expect(body.media).toMatchObject({ publicId: result.media.publicId, kind: "photo", position: { takenAt: "2026-11-11T10:20:30" } });
  });

  it("gives no position for a photo without GPS data, or a video", async () => {
    const plain = await samplePhoto({ width: 800, height: 600 });
    const photo = await startUpload(db, config, cast.publisher, entry.id, { kind: "photo", size: plain.byteLength }, plain);
    expect(photo.ok && photo.status === "complete" && photo.position).toBeNull();

    const video = sampleVideo(3000);
    const result = await startUpload(db, config, cast.publisher, entry.id, { kind: "video", size: video.byteLength }, video);
    if (!result.ok || result.status !== "complete") throw new Error(JSON.stringify(result));
    expect(result.position ?? null).toBeNull();
    expect((await uploadResponse(result, "video").json()).media.position).toBeNull();
  });
});

describe("compareCaptureTime", () => {
  const at = (publicId: string, takenAt: string | null): PhotoPosition => ({ publicId, lat: 0, lng: 0, takenAt });

  it("keeps the order of photos taken at the same time or without a time", () => {
    const sorted = [at("a", null), at("b", "2026-01-02T00:00:00"), at("c", null), at("d", "2026-01-01T00:00:00"), at("e", "2026-01-01T00:00:00")].sort(
      compareCaptureTime,
    );
    expect(sorted.map((item) => item.publicId)).toEqual(["d", "e", "b", "a", "c"]);
  });
});
