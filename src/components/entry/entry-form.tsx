"use client";

import { useEffect, useRef } from "react";
import { LocationPicker } from "@/components/map/location-picker";
import { TagPicker } from "@/components/tags/tag-picker";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { usePersistentForm } from "@/components/ui/use-persistent-form";
import { clearDraft, readFormValues, sameValues, saveDraft, type EntryFormValues } from "@/lib/entry-draft";
import { saveEntryAction } from "@/server/actions/entries";

/** How often what is typed is copied to the device. */
const AUTOSAVE_MS = 2000;

export type EntryFormProps = {
  tripId: number;
  /** Existing entry to edit; omitted when writing a new one. */
  entry?: { id: number; status: "draft" | "published" };
  /** Values the form starts with: the saved entry, or a local draft being resumed. */
  defaults: EntryFormValues;
  /** Where the local copy of what is typed is kept on this device. */
  draftKey: string;
  /** Accounts that can be identified in the entry. */
  people: { id: number; displayName: string }[];
  /** Places already used in this trip: where the map opens for an entry without a place. */
  tripPoints: { lat: number; lng: number }[];
  /** Every existing tag. */
  tags: { id: number; name: string; slug: string }[];
};

function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function EntryForm({ tripId, entry, defaults, draftKey, people, tripPoints, tags }: EntryFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  // Once saved, the local copy is useless: remove it and stop copying.
  const saved = useRef(false);
  const { state, pending, formProps } = usePersistentForm(saveEntryAction, {
    onSuccess: () => {
      saved.current = true;
      clearDraft(draftKey);
    },
  });

  // A new entry defaults to today, in the timezone of the device.
  useEffect(() => {
    const input = dateInput.current;
    if (input && !input.value) input.value = today();
  }, []);

  // Copy what is typed to the device, so a lost connection or a closed page loses nothing.
  useEffect(() => {
    let pristine: EntryFormValues | null = null;
    let wrote = false;

    function snapshot() {
      if (!form.current || saved.current) return;
      const values = readFormValues(form.current);
      // The state right after loading is the reference: no change, no copy.
      pristine ??= values;
      if (!sameValues(values, pristine)) {
        saveDraft(draftKey, values);
        wrote = true;
      } else if (wrote) {
        clearDraft(draftKey);
        wrote = false;
      }
    }

    const first = window.setTimeout(snapshot, 0);
    const timer = window.setInterval(snapshot, AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") snapshot();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", snapshot);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", snapshot);
    };
  }, [draftKey]);

  const isPublished = entry?.status === "published";

  return (
    <form ref={form} {...formProps} className="space-y-5">
      {entry ? (
        <input type="hidden" name="entryId" value={entry.id} />
      ) : (
        <input type="hidden" name="tripId" value={tripId} />
      )}

      <TextField label="Date" name="date" type="date" ref={dateInput} defaultValue={defaults.date} required />
      <TextField label="Titre" name="title" type="text" defaultValue={defaults.title} maxLength={150} required />
      <TextareaField
        label="Texte"
        name="body"
        defaultValue={defaults.body}
        rows={10}
        maxLength={20000}
        hint="Mise en forme : **gras** et [texte du lien](https://exemple.fr). Une ligne vide sépare deux paragraphes."
      />

      {people.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium">Personnes identifiées</legend>
          <p className="text-sm text-muted">Au moins une personne est nécessaire pour publier.</p>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2">
            {people.map((person) => (
              <label key={person.id} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name="people"
                  value={person.id}
                  defaultChecked={defaults.peopleIds.includes(person.id)}
                  className="size-5 shrink-0 accent-accent"
                />
                <span>{person.displayName}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <TagPicker tags={tags} selectedIds={defaults.tagIds} initialNewTags={defaults.newTags} />

      <LocationPicker initialA={defaults.pointA} initialB={defaults.pointB} contextPoints={tripPoints} />

      {!entry ? (
        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-medium">Photos et vidéos</legend>
          <p className="mb-3 text-sm text-muted">
            Les photos et vidéos s&apos;ajoutent une fois le brouillon enregistré.
          </p>
          <SubmitButton name="intent" value="save_media" variant="secondary" pending={pending}>
            Enregistrer le brouillon et ajouter des photos
          </SubmitButton>
        </fieldset>
      ) : null}

      <FormMessage state={state} />

      <div className="flex flex-wrap gap-3">
        {isPublished ? (
          <>
            <SubmitButton name="intent" value="save" pending={pending} pendingLabel="Enregistrement…">
              Enregistrer les modifications
            </SubmitButton>
            <SubmitButton name="intent" value="unpublish" variant="secondary" pending={pending}>
              Retirer (repasser en brouillon)
            </SubmitButton>
          </>
        ) : (
          <>
            <SubmitButton name="intent" value="save" variant="secondary" pending={pending} pendingLabel="Enregistrement…">
              Enregistrer le brouillon
            </SubmitButton>
            <SubmitButton name="intent" value="publish" pending={pending}>
              Publier
            </SubmitButton>
          </>
        )}
      </div>
    </form>
  );
}
