/** Only retire the former Sorstar worker, never another app's registration. */
export async function retireLegacyServiceWorker(
  workers: ServiceWorkerContainer,
  cacheStorage: CacheStorage | undefined,
  origin: string,
): Promise<void> {
  for (const registration of await workers.getRegistrations()) {
    if (registration.scope !== `${origin}/sorstar/`) continue
    const scripts = [registration.active, registration.waiting, registration.installing]
      .filter((worker): worker is ServiceWorker => worker !== null)
    if (!scripts.length || !scripts.every(worker => {
      const url = new URL(worker.scriptURL)
      return url.origin === origin && url.pathname === '/sorstar/sw.js'
    })) continue
    await registration.unregister()
  }
  if (!cacheStorage) return
  for (const name of await cacheStorage.keys()) {
    const requests = await (await cacheStorage.open(name)).keys()
    // Cache names alone cannot prove ownership. Mixed/empty caches are retained.
    if (requests.length && requests.every(request => {
      const url = new URL(request.url)
      return url.origin === origin && url.pathname.startsWith('/sorstar/')
    })) await cacheStorage.delete(name)
  }
}
