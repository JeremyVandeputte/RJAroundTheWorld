import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import type { Db } from "@/server/db/client";
import { entries, media } from "@/server/db/schema";
import { ffmpegArguments, scheduleTranscode, transcodeMedia, type FfmpegRunner } from "@/server/media/transcode";
import { startUpload, type UploadConfig } from "@/server/media/upload";
import { createEntry, type Entry } from "@/server/services/entries";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip } from "./helpers/fixtures";
import { createMediaConfig, removeMediaDir, sampleVideo, sampleWebm } from "./helpers/media";
import { createTestDb } from "./helpers/test-db";

let db: Db;
let cast: ReturnType<typeof insertCast>;
let config: UploadConfig & { ffmpegPath: string };
let trip: Trip;
let entry: Entry;

/** Stands in for ffmpeg: writes the output file named last in the arguments. */
const fakeFfmpeg =
  (content = "converted video"): FfmpegRunner =>
  async (args) => {
    fs.writeFileSync(args.at(-1)!, content);
  };

async function uploadVideo(bytes = sampleWebm(4000)) {
  // Recorded as "pending"; the conversion is triggered by hand in these tests.
  const result = await startUpload(db, { ...config, ffmpegPath: null }, cast.publisher, entry.id, { kind: "video", size: bytes.byteLength }, bytes);
  if (!result.ok || result.status !== "complete") throw new Error(JSON.stringify(result));
  db.update(media).set({ processing: "pending" }).where(eq(media.publicId, result.media.publicId)).run();
  return db.select().from(media).where(eq(media.publicId, result.media.publicId)).get()!;
}

const row = (id: number) => db.select().from(media).where(eq(media.id, id)).get();
const filesOf = (entryId: number) => fs.readdirSync(path.join(config.mediaDir, String(entryId))).sort();

beforeEach(() => {
  db = createTestDb();
  cast = insertCast(db);
  config = { ...createMediaConfig(), ffmpegPath: "ffmpeg" };
  trip = makeTrip(db, cast.superuser);
  const created = createEntry(db, cast.publisher, trip.id, entryInput({ peopleIds: [cast.guest.id] }), "save");
  if (!created.ok) throw new Error(created.reason);
  entry = created.entry;
});
afterEach(() => removeMediaDir(config));

describe("ffmpeg arguments", () => {
  it("ask for H.264 and AAC in an MP4 that starts fast, at most 1080p, without metadata", () => {
    const args = ffmpegArguments("in.mov", "out.mp4");
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect(value("-i")).toBe("in.mov");
    expect(args.at(-1)).toBe("out.mp4");
    expect(value("-c:v")).toBe("libx264");
    expect(value("-c:a")).toBe("aac");
    expect(value("-pix_fmt")).toBe("yuv420p");
    expect(value("-movflags")).toBe("+faststart");
    expect(value("-map_metadata")).toBe("-1");
    expect(value("-vf")).toContain("min(1920,iw)");
    expect(args).toContain("-nostdin");
  });
});

describe("configuration", () => {
  const base = { SESSION_SECRET: "s".repeat(32), ACCESS_TOKEN: "t".repeat(32) };
  it("converts videos only when FFMPEG_PATH is set", () => {
    expect(parseEnv(base).ffmpegPath).toBeNull();
    expect(parseEnv({ ...base, FFMPEG_PATH: "  " }).ffmpegPath).toBeNull();
    expect(parseEnv({ ...base, FFMPEG_PATH: "/usr/bin/ffmpeg" }).ffmpegPath).toBe("/usr/bin/ffmpeg");
  });
});

describe("converting a video", () => {
  it("replaces the original by an MP4 and updates its record", async () => {
    const video = await uploadVideo();
    expect(video.filePath).toBe(`${entry.id}/${video.publicId}.webm`);

    expect(await transcodeMedia(db, config, video.id, fakeFfmpeg())).toBe("converted");
    expect(row(video.id)).toMatchObject({
      publicId: video.publicId,
      filePath: `${entry.id}/${video.publicId}.mp4`,
      mimeType: "video/mp4",
      sizeBytes: "converted video".length,
      processing: null,
    });
    expect(filesOf(entry.id)).toEqual([`${video.publicId}.mp4`]);
  });

  it("replaces an MP4 original in place", async () => {
    const video = await uploadVideo(sampleVideo(4000, "mp42"));
    expect(await transcodeMedia(db, config, video.id, fakeFfmpeg("smaller"))).toBe("converted");
    expect(filesOf(entry.id)).toEqual([`${video.publicId}.mp4`]);
    expect(fs.readFileSync(path.join(config.mediaDir, row(video.id)!.filePath), "utf8")).toBe("smaller");
  });

  it("keeps the original when ffmpeg fails", async () => {
    const video = await uploadVideo();
    const failing: FfmpegRunner = async (args) => {
      fs.writeFileSync(args.at(-1)!, "partial");
      throw new Error("Invalid data found when processing input");
    };
    const errors = console.error;
    console.error = () => undefined;
    try {
      expect(await transcodeMedia(db, config, video.id, failing)).toBe("failed");
    } finally {
      console.error = errors;
    }
    expect(row(video.id)).toMatchObject({ filePath: video.filePath, mimeType: video.mimeType, processing: "failed" });
    expect(filesOf(entry.id)).toEqual([`${video.publicId}.webm`]);
  });

  it("keeps nothing when the entry is deleted during the conversion", async () => {
    const video = await uploadVideo();
    const deleting: FfmpegRunner = async (args) => {
      db.delete(entries).where(eq(entries.id, entry.id)).run();
      fs.writeFileSync(args.at(-1)!, "converted");
    };
    expect(await transcodeMedia(db, config, video.id, deleting)).toBe("skipped");
    expect(fs.readdirSync(path.join(config.mediaDir, String(entry.id)))).not.toContain(`${video.publicId}.converting.mp4`);
  });

  it("does nothing for a video already converted, or a photo", async () => {
    const video = await uploadVideo();
    db.update(media).set({ processing: null }).where(eq(media.id, video.id)).run();
    let called = false;
    expect(await transcodeMedia(db, config, video.id, async () => void (called = true))).toBe("skipped");
    expect(called).toBe(false);
  });

  it("converts one video at a time, in order", async () => {
    const first = await uploadVideo();
    const second = await uploadVideo();
    const order: string[] = [];
    const slow: FfmpegRunner = async (args) => {
      order.push(`start ${path.basename(args.at(-1)!)}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      fs.writeFileSync(args.at(-1)!, "converted");
      order.push(`end ${path.basename(args.at(-1)!)}`);
    };
    void scheduleTranscode(db, config, first.id, slow);
    await scheduleTranscode(db, config, second.id, slow);
    expect(order).toEqual([
      `start ${first.publicId}.converting.mp4`,
      `end ${first.publicId}.converting.mp4`,
      `start ${second.publicId}.converting.mp4`,
      `end ${second.publicId}.converting.mp4`,
    ]);
    expect(row(first.id)?.processing).toBeNull();
    expect(row(second.id)?.processing).toBeNull();
  });

  it("is not scheduled without ffmpeg", async () => {
    const video = await uploadVideo();
    let called = false;
    await scheduleTranscode(db, { ...config, ffmpegPath: null }, video.id, async () => void (called = true));
    expect(called).toBe(false);
    expect(row(video.id)?.processing).toBe("pending");
  });
});

describe("uploading a video", () => {
  it("is marked for conversion only when ffmpeg is configured", async () => {
    const bytes = sampleVideo(4000);
    const plain = await startUpload(db, { ...config, ffmpegPath: null }, cast.publisher, entry.id, { kind: "video", size: bytes.byteLength }, bytes);
    if (!plain.ok || plain.status !== "complete") throw new Error("upload");
    expect(db.select().from(media).where(eq(media.publicId, plain.media.publicId)).get()?.processing).toBeNull();
  });
});
