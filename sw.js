// Service worker: guarda la app para que funcione sin conexión.
// Sube VERSION cada vez que publiques cambios para que el iPhone descargue la nueva versión.
const VERSION = 'mmv-v4';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/util.js', 'js/db.js', 'js/datos.js', 'js/scheduler.js', 'js/coach.js', 'js/finanzas.js',
  'js/cerdito.js', 'js/frases.js', 'js/iphone.js', 'js/progreso.js', 'js/logros.js', 'js/grafica.js', 'js/plan.js',
  'js/views/comun.js', 'js/views/hoy.js', 'js/views/objetivos.js', 'js/views/horario.js',
  'js/views/ahorro.js', 'js/views/coach.js', 'js/views/perfil.js', 'js/views/progreso.js',
  'js/views/revision.js', 'js/views/foco.js', 'js/views/bienvenida.js', 'js/views/plan.js',
  'docs/atajo-recordatorios.md', 'docs/acceso-rapido.md',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' evita guardar copias viejas de la caché del navegador.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la caché (rápido y sin conexión); en segundo plano se actualiza desde la red.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cacheada = await cache.match(e.request, { ignoreSearch: true });
    const red = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cacheada || cache.match('index.html'));
    return cacheada || red;
  }));
});
