// Service worker: guarda la app en caché para abrirla y usarla sin conexión.
// Los REGISTROS no pasan por aquí: viven en IndexedDB y en Supabase.
const VERSION = 'medicina-v1.1.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/store.js', './js/sync.js', './js/remote-supabase.js', './js/config.js', './js/auth.js', './js/account.js',
  './js/dates.js', './js/ui.js', './js/art.js', './js/theme.js', './js/meds.js', './js/schedule.js', './js/stock.js',
  './js/model.js', './js/notify.js', './js/forms.js', './js/data-io.js', './js/pdf.js', './js/photo.js',
  './js/views/common.js', './js/views/home.js', './js/views/medicines.js', './js/views/history.js', './js/views/calendar.js', './js/views/profile.js',
  './js/vendor/supabase.js', './js/vendor/jspdf.umd.min.js', './js/vendor/jspdf.plugin.autotable.min.js',
  './fonts/dm-sans-latin-400-normal.woff2', './fonts/dm-sans-latin-500-normal.woff2', './fonts/dm-sans-latin-600-normal.woff2',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la caché (arranque instantáneo y sin conexión); se actualiza en segundo plano.
// Las peticiones a Supabase (otro dominio) nunca se guardan en caché.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) return cached;
    const res = await network;
    return res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  }));
});

// Al tocar una notificación, abrir (o traer al frente) la app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => 'focus' in c);
    return w ? w.focus() : self.clients.openWindow('./#inicio');
  }));
});
