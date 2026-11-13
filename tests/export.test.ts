import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { media } from "@/server/db/schema";
import { buildTripExport, escapeHtml } from "@/server/export/trip-export";
import { zipStream, type ZipSource } from "@/server/export/zip";
import { startUpload, type UploadConfig } from "@/server/media/upload";
import type { Actor } from "@/server/permissions";
import { addComment, deleteComment } from "@/server/services/comments";
import { createEntry, type Entry } from "@/server/services/entries";
import type { Trip } from "@/server/services/trips";
import { entryInput, insertCast, makeTrip } from "./helpers/fixtures";
import { createMediaConfig, removeMediaDir, samplePhoto, sampleVideo } from "./helpers/media";
import { createTestDb } from "./helpers/test-db";
import { collect, readZip } from "./helpers/zip-reader";

describe("zipStream", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-zip-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function sources(): ZipSource[] {
    const file = path.join(dir, "video.bin");
    fs.writeFileSync(file, Buffer.alloc(200_000, 3));
    return [
      { name: "voyage/index.html", modifiedAt: new Date(2026, 10, 13, 10, 20, 30), data: new TextEncoder().encode("<h1>Forêt</h1>") },
      { name: "voyage/vide.txt", modifiedAt: new Date(), data: new Uint8Array() },
      { name: "voyage/media/vidéo.bin", modifiedAt: new Date(), path: file, size: 200_000 },
    ];
  }

  it("stores every file with its name and a correct CRC", async () => {
    const { entries, zip64End } = readZip(await collect(zipStream(sources())));
    expect(entries.map((entry) => entry.name)).toEqual(["voyage/index.html", "voyage/vide.txt", "voyage/media/vidéo.bin"]);
    expect(entries.every((entry) => entry.crcOk && !entry.zip64)).toBe(true);
    expect(entries[0]!.data.toString("utf8")).toBe("<h1>Forêt</h1>");
    expect(entries[2]!.data.equals(Buffer.alloc(200_000, 3))).toBe(true);
    expect(zip64End).toBe(false);
  });

  it("switches to ZIP64 records past the classic limits", async () => {
    const { entries, zip64End } = readZip(await collect(zipStream(sources(), { max32: 1000, max16: 2 })));
    expect(zip64End).toBe(true);
    expect(entries.map((entry) => entry.name)).toHaveLength(3);
    expect(entries.every((entry) => entry.crcOk)).toBe(true);
    expect(entries[2]!.zip64).toBe(true);
    expect(entries[2]!.data.length).toBe(200_000);
  });

  it("stops when a file changes while it is being exported", async () => {
    const list = sources();
    (list[2] as { size: number }).size = 10;
    await expect(collect(zipStream(list))).rejects.toThrow(/changed/);
  });
});

describe("trip export", () => {
  let db: Db;
  let cast: ReturnType<typeof insertCast>;
  let config: UploadConfig;
  let trip: Trip;

  function entry(intent: "save" | "publish", overrides = {}, author: Actor = cast.publisher, inTrip = trip): Entry {
    const result = createEntry(db, author, inTrip.id, entryInput({ peopleIds: [cast.guest.id], ...overrides }), intent);
    if (!result.ok) throw new Error(result.reason);
    return result.entry;
  }
  async function upload(target: Entry, kind: "photo" | "video", bytes: Uint8Array) {
    const result = await startUpload(db, config, cast.publisher, target.id, { kind, size: bytes.byteLength }, bytes);
    if (!result.ok || result.status !== "complete") throw new Error(JSON.stringify(result));
    return result.media;
  }
  async function archive(actor: Actor, inTrip = trip) {
    const built = await buildTripExport(db, actor, inTrip, config.mediaDir, new Date("2026-12-01T12:00:00Z"));
    if (!built) return null;
    const { entries } = readZip(await collect(zipStream(built.sources)));
    const files = new Map(entries.map((item) => [item.name, item.data]));
    return { built, files, html: files.get(`${inTrip.slug}/index.html`)!.toString("utf8"), journal: JSON.parse(files.get(`${inTrip.slug}/journal.json`)!.toString("utf8")) };
  }

  beforeEach(() => {
    db = createTestDb();
    cast = insertCast(db);
    config = createMediaConfig();
    trip = makeTrip(db, cast.superuser, { title: "Martinique", description: "Trois mois <au soleil>" });
  });
  afterEach(() => removeMediaDir(config));

  it("contains the published entries, oldest first, with their photos, videos and comments", async () => {
    const plage = entry("publish", { title: "Plage des Salines", date: "2026-11-11", body: "Une eau **turquoise**.", newTags: ["Baignade"] });
    entry("publish", { title: "Pelée", date: "2026-11-14", pointB: { lat: 14.81, lng: -61.16, name: "Sommet" } });
    entry("save", { title: "Brouillon", date: "2026-11-12" });
    const photo = await upload(plage, "photo", await samplePhoto({ width: 800, height: 600 }));
    await upload(plage, "video", sampleVideo(5000));
    const comment = addComment(db, cast.guest, plage.id, { body: "Magnifique !", replyToId: null });
    const other = addComment(db, cast.guest, plage.id, { body: "Quelle couleur", replyToId: null });
    if (!comment.ok || !other.ok) throw new Error("comment");
    addComment(db, cast.publisher, plage.id, { body: "Merci", replyToId: comment.comment.id });
    // A deleted comment with replies stays as a placeholder; without replies it disappears.
    deleteComment(db, cast.guest, comment.comment.id);

    const result = (await archive(cast.superuser))!;
    expect(result.built.fileName).toBe(`${trip.slug}.zip`);
    expect(result.journal.entries.map((item: { title: string }) => item.title)).toEqual(["Plage des Salines", "Pelée"]);
    const first = result.journal.entries[0];
    expect(first).toMatchObject({ date: "2026-11-11", body: "Une eau **turquoise**.", tags: ["baignade"], people: [cast.guest.displayName] });
    expect(first.files).toEqual([
      { name: "2026-11-11-plage-des-salines.jpg", kind: "photo" },
      { name: "2026-11-11-plage-des-salines.mp4", kind: "video" },
    ]);
    expect(first.comments).toHaveLength(2);
    expect(first.comments[0]).toMatchObject({ author: null, body: "", replies: [{ body: "Merci" }] });
    expect(first.comments[1]).toMatchObject({ author: cast.guest.displayName, body: "Quelle couleur" });

    // Files are the stored ones, byte for byte.
    const stored = db.select().from(media).where(eq(media.publicId, photo.publicId)).get()!;
    expect(result.files.get(`${trip.slug}/media/2026-11-11-plage-des-salines.jpg`)!.equals(fs.readFileSync(path.join(config.mediaDir, stored.filePath)))).toBe(true);
    expect(result.files.has(`${trip.slug}/media/miniature.jpg`)).toBe(false); // the fixture's thumbnail has no file
    expect(result.built.mediaBytes).toBe(stored.sizeBytes - fs.statSync(path.join(config.mediaDir, stored.thumbPath!)).size + 5000);

    // The page reads offline: relative links to the files, no script, nothing fetched elsewhere.
    expect(result.html).toContain('<img src="media/2026-11-11-plage-des-salines.jpg"');
    expect(result.html).toContain('<video src="media/2026-11-11-plage-des-salines.mp4"');
    expect(result.html).toContain("Une eau <strong>turquoise</strong>.");
    expect(result.html).toContain("Commentaire supprimé");
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toMatch(/src="https?:/);
    expect(result.html).not.toContain("Brouillon");
  });

  it("escapes every text written by users", async () => {
    entry("publish", { title: "<script>alert(1)</script>", body: "<img src=x onerror=alert(1)> [lien](javascript:alert(1))" });
    const { html } = (await archive(cast.superuser))!;
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Trois mois &lt;au soleil&gt;");
    expect(escapeHtml(`"'&<>`)).toBe("&quot;&#39;&amp;&lt;&gt;");
  });

  it("is only for the people who manage the trip", async () => {
    const hidden = makeTrip(db, cast.superuser, { title: "Surprise", isVisible: false });
    entry("publish", { title: "Secret" }, cast.superuser, hidden);
    expect((await archive(cast.superuser, hidden))!.journal.entries).toHaveLength(1);
    // Seeing a trip, or writing in it, is not enough.
    for (const actor of [cast.guest, cast.publisher, cast.manager, null]) {
      expect(await buildTripExport(db, actor, trip, config.mediaDir)).toBeNull();
    }
    // The author of a trip exports it while they hold "Gérer les voyages".
    const own = makeTrip(db, cast.manager, { title: "Islande" });
    expect(await buildTripExport(db, cast.manager, own, config.mediaDir)).not.toBeNull();
    expect(await buildTripExport(db, { ...cast.manager, canManageTrips: false }, own, config.mediaDir)).toBeNull();
  });

  it("leaves out a file missing on disk instead of failing", async () => {
    const plage = entry("publish", { title: "Plage" });
    const photo = await upload(plage, "photo", await samplePhoto({ width: 400, height: 300 }));
    const stored = db.select().from(media).where(eq(media.publicId, photo.publicId)).get()!;
    fs.rmSync(path.join(config.mediaDir, stored.filePath));
    const result = (await archive(cast.superuser))!;
    expect([...result.files.keys()].filter((name) => name.includes("/media/"))).toEqual([]);
  });
});
