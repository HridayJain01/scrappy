import { db, dayKey, getSetting, newId, type Photo } from './db.ts'
import { toast, sleep } from './fx.ts'
import { DEFAULT_MODEL, classify } from './gemini.ts'
import { aiCopy, prepare } from './images.ts'

/** Saves the photo first (as pending, in Unsorted), so nothing is lost if the AI never answers. */
export async function ingest(file: File): Promise<Photo> {
  const { full, thumb, ratio, takenAt } = await prepare(file)
  const photo: Photo = { id: newId(), full, thumb, ratio, takenAt, day: dayKey(new Date(takenAt)), category: 'unsorted', status: 'pending' }
  await db.photos.add(photo)
  return photo
}

const inflight = new Set<string>()

/** Asks Gemini about one pending photo. Resolves undefined when skipped (offline, busy, gone); throws on AI errors. */
export async function sortPhoto(id: string): Promise<Photo | undefined> {
  if (!navigator.onLine || inflight.has(id)) return
  inflight.add(id)
  try {
    const photo = await db.photos.get(id)
    if (photo?.status !== 'pending') return
    const [key, model] = await Promise.all([getSetting('apiKey', ''), getSetting('model', DEFAULT_MODEL)])
    const ai = await classify(await aiCopy(photo.full), key, model)
    // Re-read inside the write: the user may have moved or captioned it while Gemini was thinking.
    await db.photos
      .where('id')
      .equals(id)
      .modify((p) => {
        Object.assign(p, ai, { status: 'done', category: p.manual ? p.category : ai.category, caption: p.caption || ai.caption })
      })
    return db.photos.get(id)
  } finally {
    inflight.delete(id)
  }
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
      for (const [i, id] of ids.entries()) {
        if (!navigator.onLine) break
        if (i) await sleep(4000) // ponytail: fixed pacing for the free tier's ~15 requests/min; honour 429 retryDelay if limits bite
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
