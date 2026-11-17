"use client";

import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/components/ui/icons";
import { mediaUrl, thumbnailUrl } from "@/lib/media-url";

type Photo = { publicId: string; width: number | null; height: number | null };

const SWIPE_MIN_PX = 50;
const roundButton = "grid size-12 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/20 hover:bg-black/70";

/**
 * The photos of an entry, opened full screen on click. In the viewer, arrows (or the
 * keyboard, or a swipe) go to the previous/next photo and the cross closes it.
 * Opening adds a step to the browser history, so the phone's "back" button closes the
 * photo instead of leaving the entry (or the app).
 */
export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [current, setCurrent] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // True while the history step added on opening is still there.
  const historyStep = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const single = photos.length === 1;

  function open(index: number, event: MouseEvent) {
    // Ctrl/Cmd/Shift-click or middle click: let the browser open the file as usual.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!historyStep.current) {
      window.history.pushState({ photoViewer: true }, "");
      historyStep.current = true;
    }
    setCurrent(index);
  }

  function go(step: -1 | 1) {
    setCurrent((index) => (index === null ? null : Math.min(Math.max(index + step, 0), photos.length - 1)));
  }

  // Closing by any means (cross, Escape, Android back gesture) removes the history step.
  function onClose() {
    if (historyStep.current) {
      historyStep.current = false;
      window.history.back();
    }
    setCurrent(null);
  }

  // The browser's back button: the history step is gone, close the viewer.
  useEffect(() => {
    const onPopState = () => {
      if (!historyStep.current) return;
      historyStep.current = false;
      setCurrent(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const isOpen = current !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
    // The page behind does not scroll while a photo is shown.
    document.documentElement.classList.toggle("overflow-hidden", isOpen);
    return () => document.documentElement.classList.remove("overflow-hidden");
  }, [isOpen]);

  // Keyboard arrows, listened on the whole page: the focused arrow button disappears on the
  // first/last photo, which takes the focus out of the viewer.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // The neighbours are loaded in advance, so the next photo shows at once.
  useEffect(() => {
    if (current === null) return;
    for (const index of [current - 1, current + 1]) {
      if (photos[index]) new Image().src = mediaUrl(photos[index].publicId);
    }
  }, [current, photos]);

  function onTouchStart(event: TouchEvent) {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    // No swipe while the photo is zoomed in: the finger is moving around the photo.
    const end = event.changedTouches[0];
    if (!start || !end || (window.visualViewport?.scale ?? 1) > 1.05) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }

  const photo = current === null ? null : photos[current];

  return (
    <>
      <ul className={`grid gap-2 ${single ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
        {photos.map((item, index) => (
          <li key={item.publicId}>
            <a
              href={mediaUrl(item.publicId)}
              onClick={(event) => open(index, event)}
              aria-haspopup="dialog"
              className="block overflow-hidden rounded-md bg-line"
            >
              {/* Plain <img>: files come from the access-checked route, not from the image optimizer. */}
              <img
                src={single ? mediaUrl(item.publicId) : thumbnailUrl(item.publicId)}
                alt={`Photo ${index + 1}`}
                width={item.width ?? undefined}
                height={item.height ?? undefined}
                loading="lazy"
                decoding="async"
                className={single ? "h-auto w-full" : "aspect-square h-full w-full object-cover"}
              />
            </a>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label="Photos de l'entrée"
        onClose={onClose}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-black p-0 text-white backdrop:bg-black"
      >
        {photo && current !== null ? (
          // Horizontal moves are left to the swipe (not the browser's "swipe back"); pinch-zoom still works.
          <div
            className="relative flex h-full touch-pan-y touch-pinch-zoom items-center justify-center"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <img
              key={photo.publicId}
              src={mediaUrl(photo.publicId)}
              alt={`Photo ${current + 1} sur ${photos.length}`}
              decoding="async"
              className="max-h-full max-w-full object-contain select-none"
            />

            <p aria-live="polite" className="absolute top-4 left-4 rounded-full bg-black/50 px-3 py-1 text-sm tabular-nums">
              {current + 1} / {photos.length}
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              aria-label="Fermer la photo"
              className={`absolute top-2 right-2 ${roundButton}`}
            >
              <CloseIcon className="size-6" />
            </button>

            {current > 0 ? (
              <button type="button" onClick={() => go(-1)} aria-label="Photo précédente" className={`absolute top-1/2 left-2 -translate-y-1/2 ${roundButton}`}>
                <ChevronLeftIcon className="size-7" />
              </button>
            ) : null}
            {current < photos.length - 1 ? (
              <button type="button" onClick={() => go(1)} aria-label="Photo suivante" className={`absolute top-1/2 right-2 -translate-y-1/2 ${roundButton}`}>
                <ChevronRightIcon className="size-7" />
              </button>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
