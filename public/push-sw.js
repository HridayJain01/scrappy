// Pulled into the service worker (vite.config.ts → workbox.importScripts). The push server sends an empty poke;
// the message comes from the queue the app precomputes (src/lib/nudge.ts), so it works with the app closed.
const idb = (store, key) =>
  new Promise((resolve) => {
    const open = indexedDB.open('scrappy')
    open.onerror = () => resolve(undefined)
    open.onsuccess = () => {
      try {
        const tx = open.result.transaction(store, 'readonly').objectStore(store)
        const req = store === 'photos' ? tx.index('day').count(key) : tx.get(key)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(undefined)
      } catch {
        resolve(undefined)
      }
    }
  })

const pad = (n) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

self.addEventListener('push', (e) => {
  e.waitUntil(
    (async () => {
      const day = today()
      const queue = (await idb('settings', 'nudgeQueue'))?.value ?? []
      const n = queue.find((q) => q.day === day)
      const snapped = (await idb('photos', day)) > 0
      // A push must always show something, or the browser revokes permission. Snapped already? Make it a bonus.
      const { title, body } = snapped && n ? n.bonus : (n ?? { title: '👀 Scrappy misses you', body: 'Come snap something today 📸' })
      await self.registration.showNotification(title, { body, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', tag: 'daily' })
    })(),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => (tabs[0] ? tabs[0].focus() : self.clients.openWindow('/'))),
  )
})
