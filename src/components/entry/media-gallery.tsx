import { mediaUrl, thumbnailUrl } from "@/lib/media-url";
import type { MediaItem } from "@/server/services/media";

/** Photos (lazy-loaded thumbnails linking to the full image) and videos of an entry. */
export function MediaGallery({ items }: { items: MediaItem[] }) {
  const photos = items.filter((item) => item.kind === "photo");
  const videos = items.filter((item) => item.kind === "video");
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      {photos.length > 0 ? (
        <ul className={`grid gap-2 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
          {photos.map((photo, index) => (
            <li key={photo.publicId}>
              <a href={mediaUrl(photo.publicId)} target="_blank" rel="noopener" className="block overflow-hidden rounded-md bg-line">
                {/* Plain <img>: files come from the access-checked route, not from the image optimizer. */}
                <img
                  src={photos.length === 1 ? mediaUrl(photo.publicId) : thumbnailUrl(photo.publicId)}
                  alt={`Photo ${index + 1}`}
                  width={photo.width ?? undefined}
                  height={photo.height ?? undefined}
                  loading="lazy"
                  decoding="async"
                  className={photos.length === 1 ? "h-auto w-full" : "aspect-square h-full w-full object-cover"}
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {videos.map((video) => (
        // "#t=0.001" makes iOS show the first frame instead of an empty player.
        <video
          key={video.publicId}
          controls
          playsInline
          preload="metadata"
          src={`${mediaUrl(video.publicId)}#t=0.001`}
          className="max-h-[80vh] w-full rounded-md bg-black"
        />
      ))}
    </div>
  );
}
