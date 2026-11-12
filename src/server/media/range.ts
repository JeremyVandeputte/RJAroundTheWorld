export type ByteRange = { start: number; end: number };

/**
 * Parses a `Range: bytes=...` header for a file of `size` bytes.
 * Returns null when there is no usable single range (serve the whole file),
 * or "unsatisfiable" when the range lies outside the file (answer 416).
 * Video players, iOS in particular, rely on range requests to play and seek.
 */
export function parseRangeHeader(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText, endText] = match;
  if (startText === "" && endText === "") return null;

  let start: number;
  let end: number;
  if (startText === "") {
    // "bytes=-500": the last 500 bytes.
    const suffix = Number(endText);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
    return "unsatisfiable";
  }
  return { start, end };
}
