// App disponibile anche offline. Cambia VERSION a ogni modifica dei file.
const VERSION = 'v1';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/parser.js', 'js/importer.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Rete prima (così gli aggiornamenti arrivano subito), cache se offline.
  // La pagina aperta da "Condividi" (?url=…) usa la stessa index.html.
  const key = url.pathname.endsWith('/') ? './' : e.request;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
      return r;
    }).catch(() => caches.match(key, { ignoreSearch: true }))
  );
});
