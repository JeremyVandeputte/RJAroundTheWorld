import { asc, count, eq, inArray, sql } from "drizzle-orm";
import { slugify } from "@/lib/slug";
import type { Db } from "@/server/db/client";
import { entryTags, tags } from "@/server/db/schema";
import { canManageTags, canUseSite, canWriteEntries, type Actor } from "@/server/permissions";

// Tags: keywords shared by all trips (plage, randonnée...). Anyone who can
// write entries can create one while writing; the superuser renames and
// deletes them.

export type Tag = { id: number; name: string; slug: string };

export const TAG_NAME_MAX_LENGTH = 30;

/** "  Sortie   en mer " becomes "Sortie en mer". */
export function cleanTagName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Name accepted for a tag: 1 to 30 characters, with at least one letter or digit. */
export function isValidTagName(name: string): boolean {
  const cleaned = cleanTagName(name);
  return cleaned.length > 0 && cleaned.length <= TAG_NAME_MAX_LENGTH && slugify(cleaned).length > 0;
}

const tagColumns = { id: tags.id, name: tags.name, slug: tags.slug };

/** Every tag, alphabetically. */
export function listTags(db: Db, actor: Actor): Tag[] {
  if (!canUseSite(actor)) return [];
  return db.select(tagColumns).from(tags).orderBy(asc(sql`lower(${tags.name})`)).all();
}

/** Tags of each of the given entries (callers only pass entries the viewer may see). */
export function tagsOfEntries(db: Db, entryIds: number[]): Map<number, Tag[]> {
  const result = new Map<number, Tag[]>();
  if (entryIds.length === 0) return result;
  const rows = db
    .select({ entryId: entryTags.entryId, ...tagColumns })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(inArray(entryTags.entryId, entryIds))
    .orderBy(asc(sql`lower(${tags.name})`))
    .all();
  for (const { entryId, ...tag } of rows) {
    const list = result.get(entryId) ?? [];
    list.push(tag);
    result.set(entryId, list);
  }
  return result;
}

/** True when every id is an existing tag. */
export function tagsExist(db: Db, ids: number[]): boolean {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return true;
  if (!unique.every((id) => Number.isSafeInteger(id) && id > 0)) return false;
  return db.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique)).all().length === unique.length;
}

/**
 * Ids of the tags with these names, creating the missing ones. A name that
 * only differs by case or accents from an existing tag reuses it.
 * The caller checks that the actor may write entries.
 */
export function ensureTags(db: Db, names: string[], now = new Date()): number[] {
  const ids: number[] = [];
  for (const raw of names) {
    const name = cleanTagName(raw);
    const slug = slugify(name);
    if (!slug) continue;
    const existing = db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).get();
    ids.push(existing ? existing.id : db.insert(tags).values({ name, slug, createdAt: now }).returning().get().id);
  }
  return [...new Set(ids)];
}

/** Replaces the tags of an entry. */
export function setEntryTags(db: Db, entryId: number, tagIds: number[]): void {
  db.delete(entryTags).where(eq(entryTags.entryId, entryId)).run();
  const unique = [...new Set(tagIds)];
  if (unique.length > 0) db.insert(entryTags).values(unique.map((tagId) => ({ entryId, tagId }))).run();
}

/** Whether the actor may create tags while writing an entry. */
export function canCreateTags(actor: Actor): boolean {
  return canWriteEntries(actor);
}

// --- Administration ----------------------------------------------------------

export type TagWithUsage = Tag & { entryCount: number };

export function listTagsWithUsage(db: Db, actor: Actor): TagWithUsage[] | null {
  if (!canManageTags(actor)) return null;
  return db
    .select({ ...tagColumns, entryCount: count(entryTags.entryId) })
    .from(tags)
    .leftJoin(entryTags, eq(entryTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(sql`lower(${tags.name})`))
    .all();
}

export type TagChangeResult = { ok: true } | { ok: false; reason: "forbidden" | "tag_not_found" | "invalid_tag_name" | "tag_exists" };

export function renameTag(db: Db, actor: Actor, tagId: number, newName: string): TagChangeResult {
  if (!canManageTags(actor)) return { ok: false, reason: "forbidden" };
  if (!isValidTagName(newName)) return { ok: false, reason: "invalid_tag_name" };
  const tag = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!tag) return { ok: false, reason: "tag_not_found" };

  const name = cleanTagName(newName);
  const slug = slugify(name);
  const other = db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).get();
  if (other && other.id !== tagId) return { ok: false, reason: "tag_exists" };
  db.update(tags).set({ name, slug }).where(eq(tags.id, tagId)).run();
  return { ok: true };
}

/** Deletes a tag: it is removed from every entry that used it. */
export function deleteTag(db: Db, actor: Actor, tagId: number): TagChangeResult {
  if (!canManageTags(actor)) return { ok: false, reason: "forbidden" };
  const deleted = db.delete(tags).where(eq(tags.id, tagId)).run().changes;
  return deleted > 0 ? { ok: true } : { ok: false, reason: "tag_not_found" };
}

/** Superuser-only: create a tag from the administration page. */
export function createTag(db: Db, actor: Actor, name: string): TagChangeResult {
  if (!canManageTags(actor)) return { ok: false, reason: "forbidden" };
  if (!isValidTagName(name)) return { ok: false, reason: "invalid_tag_name" };
  const slug = slugify(cleanTagName(name));
  if (db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).get()) return { ok: false, reason: "tag_exists" };
  ensureTags(db, [name]);
  return { ok: true };
}
