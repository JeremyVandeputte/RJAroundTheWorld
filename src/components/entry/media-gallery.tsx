import { mediaUrl } from "@/lib/media-url";
import type { MediaItem } from "@/server/services/media";
import { PhotoGrid } from "./photo-grid";

/** Photos (thumbnails opening a full-screen viewer) and videos of an entry. */
export function MediaGallery({ items }: { items: MediaItem[] }) {
  const photos = items.filter((item) => item.kind === "photo");
  const videos = items.filter((item) => item.kind === "video");
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      {photos.length > 0 ? (
        <PhotoGrid photos={photos.map(({ publicId, width, height }) => ({ publicId, width, height }))} />
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
