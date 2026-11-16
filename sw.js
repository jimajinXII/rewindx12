/* Rewind – service worker : appli disponible hors connexion + cache des images */
const VERSION = 'rewind-v1.5.0';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
const IMG_HOSTS = ['image.tmdb.org', 's4.anilist.co', 'img.anili.st', 'covers.openlibrary.org', 'media.rawg.io', 'books.google.com', 'books.googleusercontent.com',
  'www.thesportsdb.com', 'r2.thesportsdb.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'rewind-media').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // l'appli : réseau d'abord (pour recevoir les mises à jour), cache si hors connexion
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
    return;
  }
  const isImg = IMG_HOSTS.includes(url.hostname) && (req.destination === 'image' || req.destination === 'style' || req.destination === 'font' || /\.(jpe?g|png|webp|gif|woff2?)$/i.test(url.pathname));
  if (isImg) {
    // images et polices : cache d'abord, pour rester visibles hors connexion
    e.respondWith(caches.open('rewind-media').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
  }
});
