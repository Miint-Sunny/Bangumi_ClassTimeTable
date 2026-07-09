/* 番组课表 Service Worker:同源静态资源 stale-while-revalidate。
   API(api.bgm.tv / CDN)不经此层 —— 应用自己在 localStorage 做了带 TTL 的缓存。 */
const CACHE = 'btt-static-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(e.request)
      const net = fetch(e.request)
        .then((r) => {
          if (r.ok) cache.put(e.request, r.clone())
          return r
        })
        .catch(() => null)
      if (hit) {
        e.waitUntil(net) // 后台刷新,下次访问用新版
        return hit
      }
      const r = await net
      return r ?? new Response('离线且无缓存', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    })(),
  )
})
