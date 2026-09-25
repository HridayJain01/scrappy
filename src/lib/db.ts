import Dexie, { liveQuery, type EntityTable } from 'dexie'
import { useEffect, useState } from 'react'

export type Category = 'fits' | 'food' | 'views' | 'random'
export type AlbumId = Category | 'unsorted'

export interface Photo {
  id: string
  full: Blob // JPEG, max 1600px long side
  thumb: Blob // JPEG, max 400px long side
  ratio: number // width / height
  takenAt: number // epoch ms (EXIF date or capture time)
  day: string // local YYYY-MM-DD
  category: AlbumId
  status: 'pending' | 'done' // pending = the AI hasn't captioned it yet
  manual?: boolean // the user picked the album; the AI never overrides it
  title?: string
  caption?: string
  tags?: string[]
  sticker?: string
  extra?: { label: string; value: string }
}

export const CATEGORIES: Category[] = ['fits', 'food', 'views', 'random']

export const ALBUMS: Record<AlbumId, { name: string; emoji: string; color: string; burst: string; empty: string[] }> = {
  fits: {
    name: 'Fit Check',
    emoji: '👕',
    color: '#FF4FA3',
    burst: 'POW!',
    empty: ['No fits yet. Is the wardrobe on strike?', 'Zero outfits logged. Pyjamas count too, you know.', 'The runway is empty. Strike a pose!'],
  },
  food: {
    name: 'Food Diary',
    emoji: '🍜',
    color: '#FF5A36',
    burst: 'YUM!',
    empty: ['No food yet. Surviving on vibes alone?', 'Empty plate. Snap your next snack!', 'The Food Diary is hungry. Feed it.'],
  },
  views: {
    name: 'Views',
    emoji: '🌅',
    color: '#3A86FF',
    burst: 'WOW!',
    empty: ["No views yet. Look up, the sky's free.", 'Nothing scenic here… yet. Go touch grass.', 'Zero sunsets logged. The sun is disappointed.'],
  },
  random: {
    name: 'Weird & Wonderful',
    emoji: '🌀',
    color: '#2EC4B6',
    burst: 'HUH?!',
    empty: ['Nothing weird yet. Suspiciously normal.', 'No chaos detected. Go find something odd!', "The weird drawer is empty. That's weird."],
  },
  unsorted: {
    name: 'Unsorted',
    emoji: '📦',
    color: '#FFD23F',
    burst: 'SAVED!',
    empty: ['All sorted! The box is empty. ✨', 'Nothing waiting. The robot is thriving.'],
  },
}

export const db = new Dexie('scrappy') as Dexie & {
  photos: EntityTable<Photo, 'id'>
  settings: EntityTable<{ key: string; value: unknown }, 'key'>
}
db.version(1).stores({
  photos: 'id, day, status, [category+takenAt]',
  settings: 'key',
})

export const getSetting = async <T>(key: string, fallback: T) => ((await db.settings.get(key))?.value as T | undefined) ?? fallback
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value })

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** Re-runs `query` whenever the data it read changes. undefined = still loading. */
export function useLive<T>(query: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>()
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: (v) => setValue(() => v), error: console.error })
    return () => sub.unsubscribe()
  }, deps)
  return value
}

// ---- queries ----

const inAlbum = (c: AlbumId) => db.photos.where('[category+takenAt]').between([c, Dexie.minKey], [c, Dexie.maxKey])
export const albumPhotos = (c: AlbumId) => inAlbum(c).reverse().toArray()
export const albumStats = (c: AlbumId) => Promise.all([inAlbum(c).count(), inAlbum(c).last()]).then(([count, cover]) => ({ count, cover }))
export const dayPhotos = (day: string) => db.photos.where('day').equals(day).sortBy('takenAt')
export const monthPhotos = (month: string) => db.photos.where('day').between(`${month}-01`, `${month}-32`).sortBy('takenAt')
export const pendingCount = () => db.photos.where('status').equals('pending').count()
export const streakNow = async () => streakFrom((await db.photos.orderBy('day').uniqueKeys()) as string[])

/** Photo-view scopes: "c:<album>" | "d:<YYYY-MM-DD>" | "m:<YYYY-MM>". */
export const scopePhotos = (scope: string) => {
  const [kind, arg] = [scope.slice(0, 1), scope.slice(2)]
  return kind === 'c' ? albumPhotos(arg as AlbumId) : kind === 'm' ? monthPhotos(arg) : dayPhotos(arg)
}

// ---- dates & little helpers (pure, tested in logic.test.ts) ----

const pad = (n: number) => String(n).padStart(2, '0')
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromKey = (key: string) => {
  const [y, m, d = 1] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12) // noon: DST-proof day arithmetic
}

/** "Tue, 23 Sep" (+ year when it isn't this year) */
export const diaryDate = (key: string) => {
  const d = fromKey(key)
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`
}

export const monthLabel = (month: string) => fromKey(month).toLocaleDateString('en', { month: 'long', year: 'numeric' })
export const shiftMonth = (month: string, by: number) => {
  const d = fromKey(month)
  d.setMonth(d.getMonth() + by, 1)
  return dayKey(d).slice(0, 7)
}

/** Consecutive days with photos, ending today — or yesterday, so the streak survives until you snap today. */
export function streakFrom(days: string[], today = dayKey()): number {
  const have = new Set(days)
  const d = fromKey(today)
  if (!have.has(today)) d.setDate(d.getDate() - 1)
  let n = 0
  while (have.has(dayKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** Same date last month and last year. Built as strings so "Feb 31" simply matches nothing. */
export function flashbackDays(today = dayKey()) {
  const [y, m, d] = today.split('-')
  const lastMonth = m === '01' ? `${+y - 1}-12` : `${y}-${pad(+m - 1)}`
  return [
    { label: '1 month ago', day: `${lastMonth}-${d}` },
    { label: '1 year ago', day: `${+y - 1}-${m}-${d}` },
  ]
}

/** Stable -2°…2° tilt per photo. */
export const tilt = (id: string) => {
  let h = 7
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return (h % 201) / 100
}

export const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]
