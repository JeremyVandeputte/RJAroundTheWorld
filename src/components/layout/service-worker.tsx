"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js), which shows an offline page
 * when the installed application is opened without a connection. Browsers
 * only allow it over https (or on localhost).
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Without it the site works the same; only the offline page is missing.
    });
  }, []);
  return null;
}
