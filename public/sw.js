/* Personal Vault service worker.
 *
 * Caches ONLY the static app shell (HTML, JS, CSS, icons) so the app opens quickly and shows a clear
 * offline message. It never touches Supabase: those requests are cross-origin and are ignored here,
 * so documents, signed URLs and API responses are never stored by the service worker.
 */
const SHELL = 'vault-shell-v1'
const PRECACHE = ['/', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(SHELL)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(cacheKey ?? request, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(cacheKey ?? request)
    if (hit) return hit
    throw err
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase, fonts, signed URLs: not ours to cache

  if (request.mode === 'navigate') {
    // Every route is the same single-page shell. Fresh when online, cached copy when offline.
    event.respondWith(networkFirst(request, '/'))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request)) // content-hashed file names never change
    return
  }
  if (PRECACHE.includes(url.pathname)) event.respondWith(networkFirst(request))
})
