// Service worker of the installed application.
//
// It caches nothing: pages and photos are private and always come from the
// server. Its only role is to show a clear French page, instead of the
// browser's error, when a page is opened without any connection.

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
