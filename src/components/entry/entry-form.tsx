"use client";

import { useEffect, useRef } from "react";
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
};

function PointFields({ prefix, legend, hint, point }: { prefix: "pointA" | "pointB"; legend: string; hint: string; point?: Point }) {
  return (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Latitude"
          name={`${prefix}Lat`}
          type="text"
          inputMode="decimal"
          placeholder="14.6037"
          defaultValue={point?.lat ?? ""}
        />
        <TextField
          label="Longitude"
          name={`${prefix}Lng`}
          type="text"
          inputMode="decimal"
          placeholder="-61.0742"
          defaultValue={point?.lng ?? ""}
        />
      </div>
      <div className="mt-3">
        <TextField
          label="Nom du lieu (facultatif)"
          name={`${prefix}Name`}
          type="text"
          maxLength={100}
          defaultValue={point?.name ?? ""}
        />
      </div>
    </fieldset>
  );
}

export function EntryForm({ tripId, entry, people }: EntryFormProps) {
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

      <div className="space-y-3">
        <PointFields
          prefix="pointA"
          legend="Lieu (point A)"
          hint="Nécessaire pour publier. Saisie provisoire des coordonnées : le choix sur la carte arrive bientôt."
          point={entry?.pointA}
        />
        <PointFields
          prefix="pointB"
          legend="Arrivée (point B, facultatif)"
          hint="Uniquement pour un trajet à sens unique de A vers B, par exemple une randonnée."
          point={entry?.pointB}
        />
      </div>

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
