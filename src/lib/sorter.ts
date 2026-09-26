import { classifyLocally } from './clip.ts'
import { db, dayKey, getSetting, loadAlbums, newId, routeAlbum, type AlbumId, type Photo } from './db.ts'
import { sleep, toast } from './fx.ts'
import { DEFAULT_MODEL, classify, type AiResult } from './gemini.ts'
import { aiCopy, prepare } from './images.ts'

let askedToPersist = false

/**
 * Saves the photo first (as pending), so nothing is lost if sorting never finishes.
 * `into` puts it straight into an album of your choice; the AI then only writes its words.
 */
export async function ingest(file: File, into?: AlbumId): Promise<Photo> {
  const { full, thumb, ratio, takenAt } = await prepare(file)
  const day = dayKey(new Date(takenAt))
  const photo: Photo = { id: newId(), full, thumb, ratio, takenAt, day, category: into ?? 'unsorted', manual: !!into, status: 'pending' }
  await db.photos.add(photo)
  // First photo: ask the browser not to evict our storage. Most grant silently; installed apps almost always do.
  if (!askedToPersist) {
    askedToPersist = true
    navigator.storage?.persist?.().catch(() => {})
  }
  return photo
}

/** Gemini when you've added a key (wittier captions); otherwise, or if Gemini fails, the on-device model. */
async function describe(photo: Photo, seed = photo.id): Promise<AiResult> {
  const key = await getSetting('apiKey', '')
  if (key && navigator.onLine) {
    try {
      return await classify(await aiCopy(photo.full), key, await getSetting('model', DEFAULT_MODEL))
    } catch (e) {
      toast(`Gemini hiccup (${(e as Error).message}), so I sorted it on-device.`)
    }
  }
  return classifyLocally(photo, seed)
}

const inflight = new Set<string>()

/** Sorts one pending photo. Resolves undefined when skipped (busy, gone, already done); throws if sorting failed. */
export async function sortPhoto(id: string): Promise<Photo | undefined> {
  if (inflight.has(id)) return
  inflight.add(id)
  try {
    const photo = await db.photos.get(id)
    if (photo?.status !== 'pending') return
    const [ai, albums] = await Promise.all([describe(photo), loadAlbums()])
    // Re-read inside the write: the user may have moved or captioned it while the AI was thinking.
    await db.photos
      .where('id')
      .equals(id)
      .modify((p) => {
        const category = p.manual ? p.category : routeAlbum(albums, ai)
        Object.assign(p, ai, { status: 'done', aiCategory: ai.category, category, caption: p.caption || ai.caption })
      })
    return db.photos.get(id)
  } finally {
    inflight.delete(id)
  }
}

/** 🎲 Fresh title, caption, sticker, tags and extra for a photo. Its album stays put (unsorted photos get sorted). */
export async function rewrite(id: string) {
  const photo = await db.photos.get(id)
  if (!photo) return
  if (photo.status === 'pending') return void (await sortPhoto(id))
  const { category, ...words } = await describe(photo, `${id}:${Date.now()}`)
  await db.photos.update(id, { ...words, aiCategory: category })
}

let running: Promise<void> | undefined

/** Retries everything still pending, one at a time. Safe to call from anywhere; concurrent calls share one run. */
export function sortPending() {
  return (running ??= (async () => {
    let sorted = 0
    let failed = 0
    let lastError = ''
    try {
      const ids = await db.photos.where('status').equals('pending').primaryKeys()
      const gemini = !!(await getSetting('apiKey', ''))
      for (const [i, id] of ids.entries()) {
        if (i && gemini) await sleep(4000) // ponytail: fixed pacing for Gemini's free tier (~15 requests/min)
        try {
          if (await sortPhoto(id)) sorted++
        } catch (e) {
          failed++
          lastError = (e as Error).message
        }
      }
    } finally {
      running = undefined
    }
    if (sorted) toast(`Sorted ${sorted} photo${sorted > 1 ? 's' : ''} ✨`)
    if (failed) toast(`${failed} still unsorted 📦 ${lastError}`)
  })())
}

addEventListener('online', () => void sortPending())
