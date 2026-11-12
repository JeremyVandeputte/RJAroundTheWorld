"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { mediaUrl, thumbnailUrl } from "@/lib/media-url";
import { createUpload, detectUploadKind, UploadError, type UploadedMedia, type UploadKind } from "@/lib/upload-client";
import { deleteMediaAction } from "@/server/actions/media";

type MediaManagerProps = {
  entryId: number;
  initialItems: UploadedMedia[];
  maxPhotoBytes: number;
  maxVideoBytes: number;
};

type Task = {
  id: number;
  name: string;
  size: number;
  status: "waiting" | "uploading" | "done" | "error";
  sentBytes: number;
  error?: string;
  /** False when trying again cannot help (wrong format, too large, refused). */
  canRetry: boolean;
  upload?: ReturnType<typeof createUpload>;
};

const megabytes = (bytes: number) => Math.floor(bytes / (1024 * 1024));

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

/** Adds, lists and removes the photos and videos of an entry. Files are sent one after the other. */
export function MediaManager({ entryId, initialItems, maxPhotoBytes, maxVideoBytes }: MediaManagerProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The queue runs outside React renders: keep the latest tasks in a ref.
  const tasksRef = useRef<Task[]>([]);
  const running = useRef(false);
  const nextId = useRef(1);

  function commit(next: Task[]) {
    tasksRef.current = next;
    setTasks(next);
  }
  function update(id: number, changes: Partial<Task>) {
    commit(tasksRef.current.map((task) => (task.id === id ? { ...task, ...changes } : task)));
  }

  const isBusy = tasks.some((task) => task.status === "waiting" || task.status === "uploading");

  // Warn before leaving the page while files are still being sent.
  useEffect(() => {
    if (!isBusy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isBusy]);

  async function processQueue() {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const task = tasksRef.current.find((candidate) => candidate.status === "waiting");
        if (!task?.upload) break;
        update(task.id, { status: "uploading", error: undefined });
        try {
          const media = await task.upload.run((sentBytes) => update(task.id, { sentBytes }));
          setItems((current) => [...current, media]);
          update(task.id, { status: "done", sentBytes: task.size });
        } catch (error) {
          const isUploadError = error instanceof UploadError;
          update(task.id, {
            status: "error",
            error: isUploadError ? error.message : "L'envoi a échoué. Réessayez.",
            canRetry: isUploadError ? error.retryable : true,
          });
        }
      }
    } finally {
      running.current = false;
      // Show the new files to the rest of the page (and to other pages) on next load.
      router.refresh();
    }
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const added = files.map((file): Task => {
      const base = { id: nextId.current++, name: file.name, size: file.size, sentBytes: 0 };
      const refused = (error: string): Task => ({ ...base, status: "error", error, canRetry: false });

      const kind: UploadKind | null = detectUploadKind(file);
      if (!kind) return refused("Ce type de fichier n'est pas pris en charge (photos et vidéos uniquement).");
      const limit = kind === "photo" ? maxPhotoBytes : maxVideoBytes;
      if (file.size > limit) {
        return refused(`${kind === "photo" ? "Cette photo" : "Cette vidéo"} dépasse la taille maximale de ${megabytes(limit)} Mo.`);
      }
      if (file.size === 0) return refused("Ce fichier est vide.");
      return { ...base, status: "waiting", canRetry: true, upload: createUpload(entryId, file, kind) };
    });
    commit([...tasksRef.current, ...added]);
    void processQueue();
  }

  function retry(id: number) {
    update(id, { status: "waiting", error: undefined });
    void processQueue();
  }

  function dismiss(id: number) {
    commit(tasksRef.current.filter((task) => task.id !== id));
  }

  async function remove(publicId: string) {
    setDeleteError(null);
    const result = await deleteMediaAction(publicId);
    if (result.error) {
      setDeleteError(result.error);
    } else {
      setItems((current) => current.filter((item) => item.publicId !== publicId));
    }
    setConfirmingDelete(null);
  }

  const visibleTasks = tasks.filter((task) => task.status !== "done");

  return (
    <div className="space-y-4">
      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.publicId} className="overflow-hidden rounded-md border border-line bg-white">
              {item.kind === "photo" ? (
                <img
                  src={thumbnailUrl(item.publicId)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <video
                  src={`${mediaUrl(item.publicId)}#t=0.001`}
                  preload="metadata"
                  muted
                  playsInline
                  className="aspect-square w-full bg-black object-cover"
                />
              )}
              <div className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                <span className="text-muted">{item.kind === "photo" ? "Photo" : "Vidéo"}</span>
                {confirmingDelete === item.publicId ? (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => remove(item.publicId)} className="min-h-11 font-medium text-red-800">
                      Confirmer
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(null)} className="min-h-11 text-muted">
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmingDelete(item.publicId)} className="min-h-11 text-red-800">
                    Supprimer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune photo ni vidéo pour le moment.</p>
      )}

      {deleteError ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {deleteError}
        </p>
      ) : null}

      {visibleTasks.length > 0 ? (
        <ul className="space-y-2" aria-live="polite">
          {visibleTasks.map((task) => {
            const percent = task.size > 0 ? Math.min(100, Math.round((task.sentBytes / task.size) * 100)) : 0;
            return (
              <li key={task.id} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{task.name}</span>
                  <span className="shrink-0 text-muted">{formatSize(task.size)}</span>
                </div>
                {task.status === "error" ? (
                  <div className="mt-1">
                    <p role="alert" className="text-red-800">
                      {task.error}
                    </p>
                    <div className="mt-1 flex gap-4">
                      {task.canRetry ? (
                        <button type="button" onClick={() => retry(task.id)} className="min-h-11 font-medium text-accent">
                          {task.sentBytes > 0 ? "Reprendre l'envoi" : "Réessayer"}
                        </button>
                      ) : null}
                      <button type="button" onClick={() => dismiss(task.id)} className="min-h-11 text-muted">
                        Retirer de la liste
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      aria-label={`Envoi de ${task.name}`}
                      className="h-2 overflow-hidden rounded-full bg-line"
                    >
                      <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-1 text-muted">
                      {task.status === "waiting"
                        ? "En attente…"
                        : percent >= 100
                          ? "Traitement…"
                          : `Envoi… ${percent} %`}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-line bg-white px-4 py-2 font-medium hover:bg-paper">
          Ajouter des photos ou des vidéos
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={addFiles}
            className="sr-only"
          />
        </label>
        <p className="mt-2 text-sm text-muted">
          Photos jusqu&apos;à {megabytes(maxPhotoBytes)} Mo, vidéos jusqu&apos;à {megabytes(maxVideoBytes)} Mo. Les fichiers
          sont enregistrés dès qu&apos;ils sont envoyés, sans attendre « Enregistrer ». Gardez cette page ouverte pendant
          l&apos;envoi.
        </p>
      </div>
    </div>
  );
}
