// Daily reminder. With VITE_PUSH_URL set (see push/README.md), a tiny push server pokes the phone at reminder time,
// even with the app closed, and public/push-sw.js shows the message from the queue precomputed here.
// Without it, reminders only fire while the app is running.
import { allDays, dayKey, fromKey, getSetting, setSetting, streakFrom } from './db.ts'
import { nudgeFor } from './fun.ts'

const PUSH_URL = import.meta.env.VITE_PUSH_URL as string | undefined
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const canPush = !!(PUSH_URL && VAPID_KEY && 'PushManager' in window)

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function subscription(create: boolean) {
  const reg = await navigator.serviceWorker?.ready
  if (!reg || !canPush) return null
  return (await reg.pushManager.getSubscription()) ?? (create ? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_KEY!) }) : null)
}

export async function enableReminders(hour = 19) {
  if (!('Notification' in window) || (await Notification.requestPermission()) !== 'granted') return false
  await setSetting('remindHour', hour)
  await subscription(true).catch(() => null) // falls back to while-open reminders if push isn't available
  await check()
  return true
}

export async function disableReminders() {
  await setSetting('remindHour', -1)
  const sub = await subscription(false).catch(() => null)
  if (!sub) return
  void fetch(`${PUSH_URL}/sub`, { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
  await sub.unsubscribe()
  await setSetting('pushSynced', '')
}

async function check() {
  const days = await allDays()
  const today = dayKey()
  const snapped = days.includes(today)
  void navigator.setAppBadge?.(snapped ? 0 : 1).catch(() => {}) // home-screen dot until today's photo is in
  const hour = await getSetting('remindHour', -1)
  if (hour < 0 || Notification.permission !== 'granted') return

  const name = await getSetting('name', '')
  // Next week's messages, for the service worker. If the app stays closed you add no photos, so the streaks stay right.
  const queue = Array.from({ length: 7 }, (_, i) => {
    const d = fromKey(today)
    d.setDate(d.getDate() + i)
    const day = dayKey(d)
    const streak = streakFrom(days, day)
    return { day, ...nudgeFor(day, streak, false, name), bonus: nudgeFor(day, streak, true, name) }
  })
  await setSetting('nudgeQueue', queue)

  const sub = await subscription(false).catch(() => null)
  if (sub) {
    const payload = JSON.stringify({ endpoint: sub.endpoint, hour, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, doneDay: snapped ? today : '' })
    if ((await getSetting('pushSynced', '')) === payload) return
    const res = await fetch(`${PUSH_URL}/sub`, { method: 'POST', body: payload }).catch(() => null)
    if (res?.ok) await setSetting('pushSynced', payload)
    return
  }

  // No push: remind while the app is running.
  if (new Date().getHours() < hour || snapped || (await getSetting('nudgedOn', '')) === today) return
  await setSetting('nudgedOn', today)
  const { title, body } = queue[0]
  const reg = await navigator.serviceWorker?.ready
  reg ? reg.showNotification(title, { body, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', tag: 'daily' }) : new Notification(title, { body })
}

export function startNudges() {
  if (!('Notification' in window)) return
  void check()
  addEventListener('visibilitychange', () => void check())
  setInterval(() => void check(), 15 * 60_000)
}
