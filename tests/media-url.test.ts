import { describe, expect, it } from "vitest";
import { PHOTO_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION } from "@/server/media/processing";
import { photoSrcSet } from "@/lib/media-url";

describe("photoSrcSet", () => {
  it("offers the thumbnail and the full photo with their real widths", () => {
    expect(photoSrcSet({ publicId: "abc", width: 2000, height: 1333 })).toBe("/api/media/abc?size=thumb 480w, /api/media/abc 2000w");
    // Portrait: the thumbnail is limited by its height.
    expect(photoSrcSet({ publicId: "abc", width: 1333, height: 2000 })).toBe("/api/media/abc?size=thumb 320w, /api/media/abc 1333w");
    // A small photo is not enlarged for its thumbnail.
    expect(photoSrcSet({ publicId: "abc", width: 400, height: 300 })).toBe("/api/media/abc?size=thumb 400w, /api/media/abc 400w");
  });

  it("follows the sizes used when photos are processed", () => {
    expect([PHOTO_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION]).toEqual([2000, 480]);
  });
});
