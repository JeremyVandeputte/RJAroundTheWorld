import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/app";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  // Privacy requirement: never indexed, no sharing metadata (no Open Graph).
  robots: { index: false, follow: false },
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
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
