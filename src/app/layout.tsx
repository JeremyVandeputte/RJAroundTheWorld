import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorker } from "@/components/layout/service-worker";
import { APP_NAME } from "@/lib/app";
import "./globals.css";

export const metadata: Metadata = {
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
