// Content Security Policy sent with every page.
//
// - Scripts: only the site's own, marked with a nonce that changes on every
//   request (Next.js adds it to its scripts by itself). An injected script
//   cannot run.
// - Network: the browser may only contact the site itself, plus the
//   OpenStreetMap tile server for map images. This enforces, in the browser,
//   that no third-party service receives anything else.

export const MAP_TILE_ORIGIN = "https://tile.openstreetmap.org";

export type CspOptions = {
  nonce: string;
  /** Development server: React needs eval, and live reload uses a websocket. */
  isDevelopment: boolean;
  /** Site served over https: plain http sub-requests are upgraded. */
  isHttps: boolean;
};

export function buildContentSecurityPolicy({ nonce, isDevelopment, isHttps }: CspOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    // Leaflet and React position elements with inline styles.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${MAP_TILE_ORIGIN}`,
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];
  if (isHttps) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Answers that are not pages (neutral 404, redirections) need nothing at all. */
export const LOCKED_DOWN_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
