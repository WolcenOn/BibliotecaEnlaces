const CACHE_NAME = 'biblioteca-enlaces-v2';
const APP_SHELL = [
  './',
  './index.html',
  './register.html',
  './setup.html',
  './invite.html',
  './resources.html',
  './fields.html',
  './library.html',
  './admin.html',
  './css/main.css',
  './css/library-layout.css',
  './css/auth-gate.css',
  './js/config.js',
  './js/api.js',
  './js/register.js',
  './js/setup.js',
  './js/invite.js',
  './js/resources.js',
  './js/fields.js',
  './js/admin.js',
  './js/auth-gate.js',
  './js/share-entry.js',
  './js/install.js',
  './icons/app-icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
