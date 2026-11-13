"use client";

import { useState, type KeyboardEvent } from "react";
import { slugify } from "@/lib/slug";

type TagOption = { id: number; name: string; slug: string };

type TagPickerProps = {
  /** Every existing tag. */
  tags: TagOption[];
  /** Tags already on the entry. */
  selectedIds: number[];
  /** New tags typed but not saved yet (restored from a local draft). */
  initialNewTags?: string[];
};

const MAX_LENGTH = 30;
const chip =
  "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40";

/**
 * Tags of an entry: existing tags are toggled by touching them, and a new
 * one can be typed. New tags are only created when the entry is saved.
 */
export function TagPicker({ tags, selectedIds, initialNewTags = [] }: TagPickerProps) {
  const [newTags, setNewTags] = useState<string[]>(initialNewTags);
  const [draft, setDraft] = useState("");
  const [checked, setChecked] = useState<Set<number>>(() => new Set(selectedIds));
  const [hint, setHint] = useState<string | null>(null);

  function toggle(id: number) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addDraft() {
    const name = draft.replace(/\s+/g, " ").trim();
    const slug = slugify(name);
    setHint(null);
    if (!slug) {
      setHint("Saisissez un nom de tag (lettres ou chiffres).");
      return;
    }
    // Same name as an existing tag (ignoring case and accents): select it instead.
    const existing = tags.find((tag) => tag.slug === slug);
    if (existing) {
      setChecked((current) => new Set(current).add(existing.id));
    } else if (!newTags.some((tag) => slugify(tag) === slug)) {
      setNewTags((current) => [...current, name]);
    }
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the tag instead of submitting the whole entry.
    if (event.key === "Enter") {
      event.preventDefault();
      addDraft();
    }
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium">Tags</legend>
      <p className="text-sm text-muted">Touchez un tag pour le choisir. Facultatif.</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isChecked = checked.has(tag.id);
          return (
            <label
              key={tag.id}
              className={`${chip} ${isChecked ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`}
            >
              <input
                type="checkbox"
                name="tags"
                value={tag.id}
                checked={isChecked}
                onChange={() => toggle(tag.id)}
                className="sr-only"
              />
              {tag.name}
            </label>
          );
        })}
        {newTags.map((name) => (
          <span key={name} className={`${chip} border-accent bg-accent text-white`}>
            <input type="hidden" name="newTags" value={name} />
            {name} <span className="ml-1 text-xs opacity-80">(nouveau)</span>
            <button
              type="button"
              onClick={() => setNewTags((current) => current.filter((tag) => tag !== name))}
              aria-label={`Retirer le tag ${name}`}
              className="-mr-1 ml-1 inline-flex size-7 items-center justify-center rounded-full hover:bg-white/20"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <label htmlFor="new-tag" className="sr-only">
          Nouveau tag
        </label>
        <input
          id="new-tag"
          type="text"
          value={draft}
          maxLength={MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Nouveau tag…"
          className="block min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={addDraft}
          className="inline-flex min-h-11 items-center rounded-md border border-line bg-white px-4 font-medium hover:bg-paper"
        >
          Ajouter
        </button>
      </div>
      {hint ? (
        <p role="alert" className="mt-1 text-sm text-red-800">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
