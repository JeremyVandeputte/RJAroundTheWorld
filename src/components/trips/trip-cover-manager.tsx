"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { mediaUrl, thumbnailUrl } from "@/lib/media-url";
import { createTripCoverUpload, UploadError } from "@/lib/upload-client";
import { chooseTripCoverAction } from "@/server/actions/media";

type CoverItem = { publicId: string };

type TripCoverManagerProps = {
  tripId: number;
  cover: CoverItem | null;
  /** Photos of the trip's entries that can be picked instead. */
  candidates: CoverItem[];
  maxPhotoBytes: number;
};

const button = "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-line bg-white px-4 py-2 font-medium hover:bg-paper";

/** Thumbnail of a trip: upload a photo, or pick one of its entries' photos. */
export function TripCoverManager({ tripId, cover, candidates, maxPhotoBytes }: TripCoverManagerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"upload" | string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Choisissez une photo (JPEG, PNG ou WebP).");
      return;
    }
    if (file.size > maxPhotoBytes) {
      setError(`Cette photo dépasse la taille maximale de ${Math.floor(maxPhotoBytes / (1024 * 1024))} Mo.`);
      return;
    }
    setBusy("upload");
    setProgress(0);
    try {
      await createTripCoverUpload(tripId, file).run((sent) => setProgress(Math.round((sent / file.size) * 100)));
      router.refresh();
    } catch (failure) {
      setError(failure instanceof UploadError ? failure.message : "L'envoi a échoué. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function choose(publicId: string) {
    setError(null);
    setBusy(publicId);
    try {
      const result = await chooseTripCoverAction(tripId, publicId);
      if (result.error) setError(result.error);
      else router.refresh();
    } catch {
      setError("Connexion interrompue : la miniature n'a pas été changée. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {cover ? (
        <img src={mediaUrl(cover.publicId)} alt="Miniature actuelle du voyage" className="aspect-video w-full rounded-md object-cover" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-line bg-white px-4 text-center text-sm text-muted">
          Pas encore de miniature : le voyage ne peut pas être rendu visible sans elle.
        </div>
      )}

      <div>
        <label className={`${button} ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy === "upload" ? `Envoi… ${progress} %` : cover ? "Envoyer une autre photo" : "Envoyer une photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy !== null} className="sr-only" />
        </label>
      </div>

      {candidates.length > 0 ? (
        <div>
          <p className="mb-2 text-sm text-muted">Ou choisissez une photo des entrées du voyage :</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {candidates.map((item) => {
              const isCurrent = cover?.publicId === item.publicId;
              return (
                <li key={item.publicId}>
                  <button
                    type="button"
                    onClick={() => choose(item.publicId)}
                    disabled={busy !== null || isCurrent}
                    aria-pressed={isCurrent}
                    aria-label={isCurrent ? "Miniature actuelle" : "Choisir cette photo comme miniature"}
                    className={`relative block w-full overflow-hidden rounded-md border-2 ${isCurrent ? "border-accent" : "border-transparent hover:border-accent/50"} disabled:cursor-default`}
                  >
                    <img src={thumbnailUrl(item.publicId)} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                    {isCurrent ? (
                      <span className="absolute inset-x-0 bottom-0 bg-accent py-0.5 text-center text-xs font-medium text-white">Miniature</span>
                    ) : busy === item.publicId ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs">…</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
