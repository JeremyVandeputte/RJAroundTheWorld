// Optional conversion of videos with ffmpeg (FFMPEG_PATH), so that every
// video plays in every browser and takes less room:
// - H.264 video and AAC sound in an MP4 file (what all browsers read; an
//   iPhone's HEVC videos do not play everywhere);
// - at most 1920 pixels on the long side (1080p), quality level CRF 26;
// - metadata removed (a phone records the GPS position in its videos);
// - "faststart", so playback starts before the whole file is loaded.
//
// Converting takes minutes: it runs after the upload has been answered, one
// video at a time, in the background. Until it is done the original is
// served as it is. If conversion fails, the original is kept.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import { media } from "@/server/db/schema";
import { resolveMediaPath } from "./storage";

export type TranscodeConfig = Pick<Env, "mediaDir" | "ffmpegPath">;

/** Runs ffmpeg with these arguments; rejects when it fails. */
export type FfmpegRunner = (args: string[]) => Promise<void>;

/** A conversion longer than this is stopped (and the original kept). */
const TIMEOUT_MS = 60 * 60 * 1000;

export function ffmpegArguments(input: string, output: string): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel", "error",
    "-y",
    "-i", input,
    // First video track, and the first sound track if there is one.
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-map_metadata", "-1",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "26",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    output,
  ];
}

/** Runs the ffmpeg program; keeps the end of its error output for the logs. */
export function spawnFfmpeg(program: string): FfmpegRunner {
  return (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(program, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
      let errors = "";
      child.stderr.on("data", (chunk: Buffer) => {
        errors = (errors + chunk.toString()).slice(-2000);
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${errors.trim()}`));
      });
    });
}

async function removeQuietly(file: string): Promise<void> {
  await fs.rm(file, { force: true }).catch(() => undefined);
}

/**
 * Converts one video waiting for it. Returns what happened, for the logs
 * and the tests. Never throws.
 */
export async function transcodeMedia(
  db: Db,
  config: TranscodeConfig,
  mediaId: number,
  run: FfmpegRunner,
): Promise<"converted" | "failed" | "skipped"> {
  const row = db.select().from(media).where(eq(media.id, mediaId)).get();
  if (!row || row.kind !== "video" || row.processing !== "pending") return "skipped";
  const input = resolveMediaPath(config.mediaDir, row.filePath);
  if (!input) return "skipped";

  const folder = path.posix.dirname(row.filePath);
  const finalRelative = `${folder}/${row.publicId}.mp4`;
  const finalPath = resolveMediaPath(config.mediaDir, finalRelative)!;
  const temporary = path.join(path.dirname(finalPath), `${row.publicId}.converting.mp4`);

  try {
    await run(ffmpegArguments(input, temporary));
    const { size } = await fs.stat(temporary);
    if (size === 0) throw new Error("ffmpeg produced an empty file");

    // The entry may have been deleted while converting: then keep nothing.
    if (!db.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).get()) {
      await removeQuietly(temporary);
      return "skipped";
    }
    await fs.rename(temporary, finalPath);
    if (input !== finalPath) await removeQuietly(input);
    db.update(media)
      .set({ filePath: finalRelative, mimeType: "video/mp4", sizeBytes: size, processing: null })
      .where(eq(media.id, mediaId))
      .run();
    return "converted";
  } catch (error) {
    await removeQuietly(temporary);
    db.update(media).set({ processing: "failed" }).where(eq(media.id, mediaId)).run();
    console.error(`Video ${row.publicId} could not be converted; the original is kept.`, error instanceof Error ? error.message : error);
    return "failed";
  }
}

// One conversion at a time, in the order the videos arrived.
let queue: Promise<unknown> = Promise.resolve();

/** Schedules the conversion of a video just recorded as "pending". */
export function scheduleTranscode(db: Db, config: TranscodeConfig, mediaId: number, run?: FfmpegRunner): Promise<unknown> {
  if (!config.ffmpegPath) return Promise.resolve();
  const runner = run ?? spawnFfmpeg(config.ffmpegPath);
  queue = queue.then(() => transcodeMedia(db, config, mediaId, runner));
  return queue;
}

/** At start-up: resumes the conversions interrupted by a restart. */
export function resumePendingTranscodes(db: Db, config: TranscodeConfig): void {
  if (!config.ffmpegPath) return;
  const pending = db.select({ id: media.id }).from(media).where(eq(media.processing, "pending")).all();
  for (const { id } of pending) void scheduleTranscode(db, config, id);
}
