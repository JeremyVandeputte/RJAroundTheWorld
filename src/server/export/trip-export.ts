// Export of a trip as a ZIP archive, to keep a copy of the journal outside
// the site: a page readable offline in any browser (index.html), the photos
// and videos as stored on the site, and the same content as data
// (journal.json).
//
// Only the people who manage the trip (its author with "Gérer les voyages",
// and the superuser) may export it. It contains the published entries only
// (drafts are work in progress), with their comments.

import { and, asc, eq, inArray } from "drizzle-orm";
import { stat } from "node:fs/promises";
import path from "node:path";
import { APP_NAME } from "@/lib/app";
import { formatDate, formatDateRange } from "@/lib/dates";
import { parseRichText, type InlineNode } from "@/lib/rich-text";
import { slugify } from "@/lib/slug";
import type { Db } from "@/server/db/client";
import { entries, entryPeople, media, users } from "@/server/db/schema";
import { canExportTrip, canViewEntry, type Actor } from "@/server/permissions";
import { resolveMediaPath } from "@/server/media/storage";
import { listCommentThreads, type CommentView } from "@/server/services/comments";
import { tagsOfEntries } from "@/server/services/tags";
import type { Trip } from "@/server/services/trips";
import type { ZipSource } from "./zip";

type ExportedFile = { name: string; kind: "photo" | "video" };
type ExportedComment = { author: string | null; date: string; body: string; replies: ExportedComment[] };
type ExportedPoint = { lat: number; lng: number; name: string | null };

export type ExportedEntry = {
  date: string;
  title: string;
  author: string;
  body: string;
  people: string[];
  tags: string[];
  pointA: ExportedPoint | null;
  pointB: ExportedPoint | null;
  files: ExportedFile[];
  comments: ExportedComment[];
};

export type TripExport = {
  /** Name of the archive, for the download. */
  fileName: string;
  /** Files of the archive, in order. */
  sources: ZipSource[];
  /** Total size of the photos and videos included, in bytes. */
  mediaBytes: number;
};

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

function extensionOf(mimeType: string, filePath: string): string {
  return EXTENSIONS[mimeType] ?? (path.extname(filePath).slice(1) || "bin");
}

function toComment(view: CommentView, replies: CommentView[] = []): ExportedComment {
  return {
    author: view.isDeleted ? null : view.authorName,
    date: view.createdAt.toISOString(),
    body: view.isDeleted ? "" : view.body,
    replies: replies.map((reply) => toComment(reply)),
  };
}

/**
 * The archive of a trip, or null when the actor may not export it. Files are
 * listed with their size, then read while the archive is being sent.
 */
export async function buildTripExport(db: Db, actor: Actor, trip: Trip, mediaDir: string, now = new Date()): Promise<TripExport | null> {
  if (!canExportTrip(actor, trip)) return null;
  const root = trip.slug;
  const pending: { name: string; path: string; modifiedAt: Date }[] = [];
  const usedNames = new Set<string>();

  /** Gives a stored file a readable, unique name in the archive. */
  function addFile(baseName: string, extension: string, row: { filePath: string; createdAt: Date }): string | null {
    const absolute = resolveMediaPath(mediaDir, row.filePath);
    if (!absolute) return null;
    let name = `${baseName}.${extension}`;
    for (let n = 2; usedNames.has(name); n++) name = `${baseName}-${n}.${extension}`;
    usedNames.add(name);
    pending.push({ name, path: absolute, modifiedAt: row.createdAt });
    return name;
  }

  // Thumbnail of the trip, shown at the top of the page.
  let coverName: string | null = null;
  if (trip.coverMediaId !== null) {
    const cover = db.select().from(media).where(eq(media.id, trip.coverMediaId)).get();
    if (cover) coverName = addFile("miniature", extensionOf(cover.mimeType, cover.filePath), cover);
  }

  const published = db
    .select({ entry: entries, author: users.displayName })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.authorId))
    .where(and(eq(entries.tripId, trip.id), eq(entries.status, "published")))
    .orderBy(asc(entries.date), asc(entries.id))
    .all()
    .filter(({ entry }) => canViewEntry(actor, trip, entry));
  const ids = published.map(({ entry }) => entry.id);
  const tagsByEntry = tagsOfEntries(db, ids);
  const peopleByEntry = new Map<number, string[]>();
  const filesByEntry = new Map<number, (typeof media.$inferSelect)[]>();
  if (ids.length > 0) {
    for (const row of db
      .select({ entryId: entryPeople.entryId, name: users.displayName })
      .from(entryPeople)
      .innerJoin(users, eq(users.id, entryPeople.userId))
      .where(inArray(entryPeople.entryId, ids))
      .orderBy(asc(users.displayName))
      .all()) {
      peopleByEntry.set(row.entryId, [...(peopleByEntry.get(row.entryId) ?? []), row.name]);
    }
    for (const row of db.select().from(media).where(inArray(media.entryId, ids)).orderBy(asc(media.position), asc(media.id)).all()) {
      filesByEntry.set(row.entryId!, [...(filesByEntry.get(row.entryId!) ?? []), row]);
    }
  }

  const exported: ExportedEntry[] = published.map(({ entry, author }) => {
    const base = `${entry.date}-${slugify(entry.title).slice(0, 40) || "entree"}`;
    const files: ExportedFile[] = [];
    for (const row of filesByEntry.get(entry.id) ?? []) {
      const name = addFile(base, extensionOf(row.mimeType, row.filePath), row);
      if (name) files.push({ name, kind: row.kind });
    }
    const point = (lat: number | null, lng: number | null, name: string | null): ExportedPoint | null =>
      lat !== null && lng !== null ? { lat, lng, name } : null;
    return {
      date: entry.date,
      title: entry.title,
      author,
      body: entry.body,
      people: peopleByEntry.get(entry.id) ?? [],
      tags: (tagsByEntry.get(entry.id) ?? []).map((tag) => tag.name),
      pointA: point(entry.pointALat, entry.pointALng, entry.pointAName),
      pointB: point(entry.pointBLat, entry.pointBLng, entry.pointBName),
      files,
      comments: (listCommentThreads(db, actor, trip, entry) ?? []).map((thread) => toComment(thread, thread.replies)),
    };
  });

  const encoder = new TextEncoder();
  const journal = {
    exportedAt: now.toISOString(),
    trip: { title: trip.title, description: trip.description, startDate: trip.startDate, endDate: trip.endDate, cover: coverName },
    entries: exported,
  };
  const textFiles: ZipSource[] = [
    { name: `${root}/index.html`, modifiedAt: now, data: encoder.encode(renderTripHtml(trip, exported, coverName, now)) },
    { name: `${root}/journal.json`, modifiedAt: now, data: encoder.encode(`${JSON.stringify(journal, null, 2)}\n`) },
  ];

  // A file missing on disk is left out rather than failing the whole export.
  const files: ZipSource[] = [];
  let mediaBytes = 0;
  for (const file of pending) {
    const size = await stat(file.path).then((info) => info.size, () => null);
    if (size === null) continue;
    files.push({ name: `${root}/media/${file.name}`, modifiedAt: file.modifiedAt, path: file.path, size });
    mediaBytes += size;
  }
  return { fileName: `${root}.zip`, sources: [...textFiles, ...files], mediaBytes };
}

// --- Offline page ----------------------------------------------------------------

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text placed in HTML: never interpreted as markup. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

function inline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.text);
      if (node.type === "bold") return `<strong>${inline(node.children)}</strong>`;
      return `<a href="${escapeHtml(node.href)}" rel="noopener noreferrer">${escapeHtml(node.text)}</a>`;
    })
    .join("");
}

function richText(source: string): string {
  return parseRichText(source)
    .map((lines) => `<p>${lines.map(inline).join("<br>")}</p>`)
    .join("\n");
}

function place(point: ExportedPoint, fallback: string): string {
  const label = point.name ? escapeHtml(point.name) : fallback;
  const coordinates = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  // A link, never an embedded map: opening the page contacts no server.
  const href = `https://www.openstreetmap.org/?mlat=${point.lat}&amp;mlon=${point.lng}#map=14/${point.lat}/${point.lng}`;
  return `${label} (<a href="${href}" rel="noopener noreferrer">${coordinates}</a>)`;
}

function comment(item: ExportedComment): string {
  const when = new Date(item.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const body = item.author === null ? "<em>Commentaire supprimé</em>" : escapeHtml(item.body).replace(/\n/g, "<br>");
  const replies = item.replies.length > 0 ? `<ul>${item.replies.map((reply) => `<li>${comment(reply)}</li>`).join("")}</ul>` : "";
  return `<p><strong>${escapeHtml(item.author ?? "Compte supprimé")}</strong> · ${when}<br>${body}</p>${replies}`;
}

function renderTripHtml(trip: Trip, list: ExportedEntry[], coverName: string | null, now: Date): string {
  const exportedOn = now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const entriesHtml = list
    .map((entry) => {
      const facts: string[] = [`Par ${escapeHtml(entry.author)}`];
      if (entry.pointA && entry.pointB) facts.push(`De ${place(entry.pointA, "départ")} à ${place(entry.pointB, "arrivée")}`);
      else if (entry.pointA) facts.push(`Lieu : ${place(entry.pointA, "sans nom")}`);
      if (entry.people.length > 0) facts.push(`Avec ${entry.people.map(escapeHtml).join(", ")}`);
      if (entry.tags.length > 0) facts.push(`Tags : ${entry.tags.map(escapeHtml).join(", ")}`);
      const files = entry.files
        .map((file) =>
          file.kind === "photo"
            ? `<a href="media/${encodeURI(file.name)}"><img src="media/${encodeURI(file.name)}" alt="" loading="lazy"></a>`
            : `<video src="media/${encodeURI(file.name)}" controls preload="metadata"></video>`,
        )
        .join("\n");
      const comments =
        entry.comments.length > 0
          ? `<section class="comments"><h3>Commentaires</h3><ul>${entry.comments.map((item) => `<li>${comment(item)}</li>`).join("")}</ul></section>`
          : "";
      return `<article>
<p class="date">${escapeHtml(formatDate(entry.date))}</p>
<h2>${escapeHtml(entry.title)}</h2>
<p class="facts">${facts.join(" · ")}</p>
${richText(entry.body)}
${files ? `<div class="media">${files}</div>` : ""}
${comments}
</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(trip.title)} · ${escapeHtml(APP_NAME)}</title>
<style>
  body { margin: 0 auto; max-width: 48rem; padding: 1.5rem 1rem 4rem; background: #faf8f5; color: #1f2933;
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.55; }
  header img { width: 100%; aspect-ratio: 5 / 2; object-fit: cover; border-radius: 0.5rem; }
  h1 { margin: 1rem 0 0.25rem; } h2 { margin: 0.1rem 0 0.25rem; } h3 { font-size: 1rem; margin: 1rem 0 0.25rem; }
  .muted, .date, .facts { color: #6b7280; } .date { margin: 0; font-size: 0.9rem; } .facts { margin-top: 0; font-size: 0.9rem; }
  article { border-top: 1px solid #e5e1da; padding-top: 1.25rem; margin-top: 1.5rem; }
  a { color: #0f766e; }
  .media { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 0.5rem; margin-top: 0.75rem; }
  .media img, .media video { width: 100%; border-radius: 0.375rem; background: #e5e1da; }
  .media img { aspect-ratio: 4 / 3; object-fit: cover; }
  .comments ul { list-style: none; padding-left: 0; } .comments ul ul { padding-left: 1.25rem; border-left: 2px solid #e5e1da; }
  .comments p { margin: 0.4rem 0; font-size: 0.95rem; }
  footer { margin-top: 3rem; font-size: 0.85rem; }
  /* Printing (or "Save as PDF"): white paper, no video players. */
  @media print {
    body { background: #fff; max-width: none; padding: 0; }
    video { display: none; }
    a { color: inherit; text-decoration: none; }
    .media img { break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
${coverName ? `<img src="media/${encodeURI(coverName)}" alt="">` : ""}
<h1>${escapeHtml(trip.title)}</h1>
<p class="muted">${escapeHtml(formatDateRange(trip.startDate, trip.endDate))}</p>
${trip.description ? `<p>${escapeHtml(trip.description).replace(/\n/g, "<br>")}</p>` : ""}
</header>
<main>
${list.length > 0 ? entriesHtml : '<p class="muted">Aucune entrée publiée.</p>'}
</main>
<footer class="muted">Exporté de ${escapeHtml(APP_NAME)} le ${exportedOn}. Les photos et vidéos sont dans le dossier « media ».</footer>
</body>
</html>
`;
}
