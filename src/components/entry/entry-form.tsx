"use client";

import { useEffect, useRef } from "react";
import { LocationPicker } from "@/components/map/location-picker";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { usePersistentForm } from "@/components/ui/use-persistent-form";
import { saveEntryAction } from "@/server/actions/entries";

type Point = { lat: number | null; lng: number | null; name: string | null };

type EntryFormProps = {
  tripId: number;
  /** Existing entry to edit; omitted when writing a new one. */
  entry?: {
    id: number;
    date: string;
    title: string;
    body: string;
    status: "draft" | "published";
    pointA: Point;
    pointB: Point;
    peopleIds: number[];
  };
  /** Accounts that can be identified in the entry. */
  people: { id: number; displayName: string }[];
  /** Places already used in this trip: where the map opens for an entry without a place. */
  tripPoints: { lat: number; lng: number }[];
};

function toPickerPoint(point: Point | undefined) {
  return point && point.lat !== null && point.lng !== null ? { lat: point.lat, lng: point.lng, name: point.name } : null;
}

export function EntryForm({ tripId, entry, people, tripPoints }: EntryFormProps) {
  const { state, pending, formProps } = usePersistentForm(saveEntryAction);
  const dateInput = useRef<HTMLInputElement>(null);

  // A new entry defaults to today, in the timezone of the device.
  useEffect(() => {
    const input = dateInput.current;
    if (input && !input.value) {
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      input.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
  }, []);

  const isPublished = entry?.status === "published";

  return (
    <form {...formProps} className="space-y-5">
      {entry ? (
        <input type="hidden" name="entryId" value={entry.id} />
      ) : (
        <input type="hidden" name="tripId" value={tripId} />
      )}

      <TextField label="Date" name="date" type="date" ref={dateInput} defaultValue={entry?.date} required />
      <TextField label="Titre" name="title" type="text" defaultValue={entry?.title} maxLength={150} required />
      <TextareaField
        label="Texte"
        name="body"
        defaultValue={entry?.body}
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
                  defaultChecked={entry?.peopleIds.includes(person.id)}
                  className="size-5 shrink-0 accent-accent"
                />
                <span>{person.displayName}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <LocationPicker
        initialA={toPickerPoint(entry?.pointA)}
        initialB={toPickerPoint(entry?.pointB)}
        contextPoints={tripPoints}
      />

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
