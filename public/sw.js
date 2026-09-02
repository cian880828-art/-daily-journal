const CACHE_NAME = 'daily-journal-cache-v2'
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
// back to cache when offline; cache-first for this app's own static
// assets only.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  // Anything not served from this app's own origin — Supabase (database +
  // auth), Gemini, Groq, etc. — must never be cached. This app's data is
  // never static: caching an API response here means every future read
  // silently returns whatever was true the first time that exact request
  // was made, no matter how much has changed in the database since. Let
  // those go straight to the network, uninvolved with the cache at all.
  if (new URL(request.url).origin !== self.location.origin) return

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

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || '該寫日記了'
  const options = {
    body: data.body || '花 2-5 分鐘，寫下今天的心情',
    icon: `${SCOPE}journal.svg`,
    badge: `${SCOPE}journal.svg`,
    data: { url: data.url || SCOPE },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Focuses an already-open tab on this app instead of always opening a new
// one, so tapping the notification doesn't pile up duplicate tabs/windows.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || SCOPE
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(SCOPE) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
