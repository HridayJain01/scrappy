import Dexie, { liveQuery, type EntityTable } from 'dexie'
import { useEffect, useState } from 'react'

export type Category = 'fits' | 'food' | 'views' | 'random' // what the AI can pick
export type AlbumId = string // a Category, 'unsorted', or one of your own albums' ids

export interface Album {
  id: string
  name: string
  emoji: string
  color: string
  burst: string // the comic word when a photo lands here
  keywords?: string[] // your albums: photos tagged with any of these land here automatically
  createdAt?: number // your albums are listed oldest first
  builtin?: boolean // set by loadAlbums, never stored
  empty?: string[] // built-ins' cheeky empty-state lines
}

export interface Photo {
  id: string
  full: Blob // JPEG, max 1600px long side
  thumb: Blob // JPEG, max 400px long side
  ratio: number // width / height
  takenAt: number // epoch ms (EXIF date or capture time)
  day: string // local YYYY-MM-DD
  category: AlbumId
  aiCategory?: Category // where the AI put it, so deleting one of your albums can send photos back
  status: 'pending' | 'done' // pending = the AI hasn't captioned it yet
  manual?: boolean // the user picked the album; the AI never overrides it
  title?: string
  caption?: string
  tags?: string[]
  sticker?: string
  extra?: { label: string; value: string }
}

export const CATEGORIES: Category[] = ['fits', 'food', 'views', 'random']

/** Built-in albums. You can restyle them (stored in db.albums under the same id) but not delete them. */
export const BUILTIN_ALBUMS: Record<Category | 'unsorted', Omit<Album, 'id'>> = {
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
  albums: EntityTable<Album, 'id'>
}
db.version(2).stores({
  photos: 'id, day, status, [category+takenAt]',
  settings: 'key',
  albums: 'id',
})

export const getSetting = async <T>(key: string, fallback: T) => ((await db.settings.get(key))?.value as T | undefined) ?? fallback
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value })

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// ---- albums ----

export const isBuiltin = (id: string) => Object.hasOwn(BUILTIN_ALBUMS, id)

/** Every album: the four built-ins (with your edits), your own albums (oldest first), then Unsorted. */
export async function loadAlbums(): Promise<Album[]> {
  const saved = new Map((await db.albums.toArray()).map((a) => [a.id, a]))
  const builtin = (id: Category | 'unsorted'): Album => ({ ...BUILTIN_ALBUMS[id], ...saved.get(id), id, builtin: true })
  const yours = [...saved.values()].filter((a) => !isBuiltin(a.id)).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  return [...CATEGORIES.map(builtin), ...yours, builtin('unsorted')]
}

export const saveAlbum = ({ builtin: _, empty: __, ...album }: Album) => db.albums.put(album)

/** Deletes one of your albums. Its photos go back to where the AI put them (or get re-sorted if it never saw them). */
export const deleteAlbum = (id: string) =>
  db.transaction('rw', db.photos, db.albums, async () => {
    await inAlbum(id).modify((p) => {
      p.manual = false
      p.category = p.aiCategory ?? 'unsorted'
      if (!p.aiCategory) p.status = 'pending'
    })
    await db.albums.delete(id)
  })

const norm = (s: string) => s.toLowerCase().trim().replace(/s$/, '') // "cats" matches "cat"

/** Where a freshly described photo goes: the first of your albums whose keywords match its tags, else the AI's pick. */
export function routeAlbum(albums: Album[], ai: { category: Category; tags: string[] }): AlbumId {
  const tags = new Set(ai.tags.map(norm))
  return albums.find((a) => a.keywords?.some((k) => tags.has(norm(k))))?.id ?? ai.category
}

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
