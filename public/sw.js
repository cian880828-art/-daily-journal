const CACHE_NAME = 'daily-journal-cache-v1'
// Relative to the service worker's own scope, not the domain root — this
// app can be hosted at "/" (local dev) or under a subpath like
// "/-daily-journal/" (GitHub Pages project page).
const SCOPE = self.registration.scope
const CORE_ASSETS = [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}journal.svg`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Network-first for navigations (so app updates show up quickly), falling
// back to cache when offline; cache-first for static assets.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((res) => res || caches.match(SCOPE))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return res
        }),
    ),
  )
})
