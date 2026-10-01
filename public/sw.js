// Retirement worker at the old URL: cached old HTML may never load the new app.
// Keep this file so an existing registration can update itself on an online visit.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (self.registration.scope !== `${self.location.origin}/sorstar/` ||
        self.location.pathname !== '/sorstar/sw.js') return
    try {
      for (const name of await caches.keys()) {
        const requests = await (await caches.open(name)).keys()
        if (requests.length && requests.every(request => {
          const url = new URL(request.url)
          return url.origin === self.location.origin && url.pathname.startsWith('/sorstar/')
        })) await caches.delete(name)
      }
    } finally {
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        const url = new URL(client.url)
        if (url.origin === self.location.origin && url.pathname.startsWith('/sorstar/')) {
          await client.navigate(client.url)
        }
      }
    }
  })())
})
