// Service worker of the installed application.
//
// It caches nothing: pages and photos are private and always come from the
// server. It shows a clear French page, instead of the browser's error, when a
// page is opened without any connection, and it shows the notifications sent
// to this device (turned on from the profile page).

const OFFLINE_PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Pas de connexion · RJ Around The World</title>
<style>
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
         background: #faf8f5; color: #1f2933; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 26rem; padding: 1.5rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
  p { line-height: 1.5; margin: 0 0 1rem; }
  a { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem; border-radius: 0.375rem;
      background: #0f766e; color: #fff; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1>Pas de connexion</h1>
  <p>Cette page ne peut pas être affichée sans réseau.</p>
  <p>Une entrée en cours de rédaction n'est pas perdue&nbsp;: elle est conservée sur cet appareil et vous sera proposée en rouvrant le formulaire.</p>
  <a href="">Réessayer</a>
</main>
</body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Only page loads; everything else goes to the network untouched.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(OFFLINE_PAGE, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        }),
    ),
  );
});

// --- Phone notifications ------------------------------------------------------
// The server sends { title, body, url, tag, badge } (src/server/services/push.ts).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not ours or damaged: a plain notification is still shown (Apple requires one).
  }
  const badge = typeof data.badge === "number" ? data.badge : -1;
  const updateBadge = () => {
    // Number of unread notifications on the application's icon, where supported.
    if (badge < 0 || !self.navigator.setAppBadge) return Promise.resolve();
    return (badge > 0 ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge()).catch(() => {});
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "RJ Around The World", {
        body: data.body || "Nouvelle notification",
        icon: "/icons/icon-192.png",
        tag: data.tag || undefined,
        lang: "fr",
        data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/notifications" },
      }),
      updateBadge(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      // The application already open comes to the front on that page; otherwise it opens.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        } catch {
          // Not controlled by this worker: open a new window instead.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
