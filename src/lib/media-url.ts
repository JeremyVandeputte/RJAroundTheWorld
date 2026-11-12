/** Address of a stored photo or video (served through the access-checked route). */
export function mediaUrl(publicId: string): string {
  return `/api/media/${publicId}`;
}

export function thumbnailUrl(publicId: string): string {
  return `/api/media/${publicId}?size=thumb`;
}
