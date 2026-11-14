import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorker } from "@/components/layout/service-worker";
import { APP_NAME } from "@/lib/app";
import { getDb } from "@/server/db/client";
import { getSitePhotoVersion, sitePhotoUrl } from "@/server/services/site-photo";
import "./globals.css";

const DEFAULT_ICON = "/icons/favicon.png";

export async function generateMetadata(): Promise<Metadata> {
  // The tab icon is the site photo when one was chosen in the administration.
  const photo = sitePhotoUrl(getSitePhotoVersion(getDb()), "icon");
  return { ...metadata, icons: { icon: [{ url: photo ?? DEFAULT_ICON, type: "image/png" }], apple: "/apple-icon.png" } };
}

const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  // Privacy requirement: never indexed, no sharing metadata (no Open Graph).
  robots: { index: false, follow: false },
  // Installed on an iPhone home screen: full screen, short name under the icon.
  appleWebApp: { capable: true, title: "RJ", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Colour of the browser bar on phones, matching the header.
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Cookies must be sent: without the secret link's cookie, nothing is served. */}
        <link rel="manifest" href="/app.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
