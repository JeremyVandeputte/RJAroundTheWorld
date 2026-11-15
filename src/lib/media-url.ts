/** Address of a stored photo or video (served through the access-checked route). */
export function mediaUrl(publicId: string): string {
  return `/api/media/${publicId}`;
}

export function thumbnailUrl(publicId: string): string {
  return `/api/media/${publicId}?size=thumb`;
}

/** Longest side of a stored photo, and of its thumbnail (see src/server/media/processing.ts). */
const PHOTO_MAX = 2000;
const THUMB_MAX = 480;

/**
 * `srcset` offering both the thumbnail and the full photo, so the browser
 * picks the one that stays sharp at the size and pixel density it displays:
 * the thumbnail alone is blurry on a wide card or a high-density screen.
 */
export function photoSrcSet(photo: { publicId: string; width: number | null; height: number | null }): string {
  const width = photo.width ?? PHOTO_MAX;
  const longest = Math.max(width, photo.height ?? 0);
  const thumbWidth = Math.round(width * Math.min(1, THUMB_MAX / longest));
  return `${thumbnailUrl(photo.publicId)} ${thumbWidth}w, ${mediaUrl(photo.publicId)} ${width}w`;
}
