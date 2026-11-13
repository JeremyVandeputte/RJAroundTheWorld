"use client";

import { FormMessage } from "@/components/ui/form-message";
import { usePersistentForm } from "@/components/ui/use-persistent-form";
import { createTagAction, deleteTagAction, renameTagAction } from "@/server/actions/tags";

type AdminTag = { id: number; name: string; entryCount: number };

const input =
  "block min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
const button = "inline-flex min-h-11 items-center rounded-md border border-line bg-white px-3 font-medium hover:bg-paper disabled:opacity-60";

function TagRow({ tag }: { tag: AdminTag }) {
  const rename = usePersistentForm(renameTagAction);
  const remove = usePersistentForm(deleteTagAction);
  const usage = tag.entryCount === 0 ? "aucune entrée" : tag.entryCount === 1 ? "1 entrée" : `${tag.entryCount} entrées`;
  return (
    <li className="space-y-2 px-4 py-3">
      <form {...rename.formProps} className="flex gap-2">
        <input type="hidden" name="tagId" value={tag.id} />
        <label htmlFor={`tag-${tag.id}`} className="sr-only">
          Nom du tag
        </label>
        <input id={`tag-${tag.id}`} name="name" defaultValue={tag.name} maxLength={30} required className={input} />
        <button type="submit" disabled={rename.pending} className={button}>
          Renommer
        </button>
      </form>
      <FormMessage state={rename.state} />
      <details className="text-sm">
        <summary className="min-h-9 cursor-pointer py-1 text-muted">
          Utilisé par {usage} · <span className="text-red-800">supprimer…</span>
        </summary>
        <form {...remove.formProps} className="mt-1 flex flex-wrap items-center gap-3">
          <input type="hidden" name="tagId" value={tag.id} />
          <span>Le tag sera retiré de toutes les entrées.</span>
          <button type="submit" disabled={remove.pending} className="min-h-11 font-medium text-red-800 disabled:opacity-60">
            Confirmer la suppression
          </button>
        </form>
        <FormMessage state={remove.state} />
      </details>
    </li>
  );
}

/** Tag management on the administration page. */
export function TagAdmin({ tags }: { tags: AdminTag[] }) {
  const create = usePersistentForm(createTagAction, { resetOnSuccess: true });
  return (
    <div className="space-y-3">
      {tags.length > 0 ? (
        <ul className="divide-y divide-line rounded-md border border-line bg-white">
          {tags.map((tag) => (
            <TagRow key={`${tag.id}-${tag.name}`} tag={tag} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucun tag.</p>
      )}
      <form {...create.formProps} className="flex gap-2">
        <label htmlFor="new-admin-tag" className="sr-only">
          Nouveau tag
        </label>
        <input id="new-admin-tag" name="name" maxLength={30} required placeholder="Nouveau tag…" className={input} />
        <button type="submit" disabled={create.pending} className={button}>
          Créer
        </button>
      </form>
      <FormMessage state={create.state} />
    </div>
  );
}
