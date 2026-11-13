// Web application manifest: lets the site be installed on a phone's home
// screen and open full screen like an application.
//
// Served by a route rather than the `manifest.ts` file convention, because
// the link to it must ask the browser to send cookies (see the root layout):
// like everything else, it is only served with the secret link's cookie.
//
// The application starts on the secret link itself: on an iPhone, the
// installed application does not share Safari's cookies and has no address
// bar, so it could never receive the access cookie otherwise. Only people
// who already opened the link can read this manifest.
import { APP_NAME } from "@/lib/app";
import { getEnv } from "@/lib/env";

export function GET() {
  const manifest = {
    id: "/",
    name: APP_NAME,
    short_name: "RJ",
    description: "Journal de voyage privé",
    lang: "fr",
    dir: "ltr",
    start_url: `/access/${encodeURIComponent(getEnv().accessToken)}`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf8f5",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
