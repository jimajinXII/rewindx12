/* Rewind – service worker : appli disponible hors connexion + cache des images */
const VERSION = 'rewind-v3.2.0';
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
    // seules les réponses valides sont gardées (une erreur 404 ne remplace plus la copie hors ligne)
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
    return;
  }
  const isImg = IMG_HOSTS.includes(url.hostname) && (req.destination === 'image' || req.destination === 'style' || req.destination === 'font' || /\.(jpe?g|png|webp|gif|woff2?)$/i.test(url.pathname));
  if (isImg) {
    // images et polices : cache d'abord, pour rester visibles hors connexion
    // une image demandée en CORS (calcul de la lueur) ne peut pas reprendre une copie « opaque » : on la redemande
    e.respondWith(caches.open('rewind-media').then((c) => c.match(req).then((hit) => (hit && !(req.mode === 'cors' && hit.type === 'opaque')) ? hit : fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') e.waitUntil(c.put(req, res.clone()).then(() => trimMedia(c)).catch(() => {}));
      return res;
    }))));
  }
});
// le cache des images ne grossit plus sans fin : on garde les MEDIA_MAX plus récentes
// (les images « opaques » comptent pour beaucoup dans le quota du téléphone, partagé avec les données)
const MEDIA_MAX = 400;
let trimAt = 0;
function trimMedia(c) {
  if (Date.now() - trimAt < 30000) return Promise.resolve();
  trimAt = Date.now();
  return c.keys().then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - MEDIA_MAX)).map((k) => c.delete(k))));
}
