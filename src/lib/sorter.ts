import { classifyLocally } from './clip.ts'
import { db, dayKey, getSetting, newId, type Photo } from './db.ts'
import { sleep, toast } from './fx.ts'
import { DEFAULT_MODEL, classify, type AiResult } from './gemini.ts'
import { aiCopy, prepare } from './images.ts'

let askedToPersist = false

/** Saves the photo first (as pending, in Unsorted), so nothing is lost if sorting never finishes. */
export async function ingest(file: File): Promise<Photo> {
  const { full, thumb, ratio, takenAt } = await prepare(file)
  const photo: Photo = { id: newId(), full, thumb, ratio, takenAt, day: dayKey(new Date(takenAt)), category: 'unsorted', status: 'pending' }
  await db.photos.add(photo)
  // First photo: ask the browser not to evict our storage. Most grant silently; installed apps almost always do.
  if (!askedToPersist) {
    askedToPersist = true
    navigator.storage?.persist?.().catch(() => {})
  }
  return photo
}

/** Gemini when you've added a key (wittier captions); otherwise, or if Gemini fails, the on-device model. */
async function describe(photo: Photo): Promise<AiResult> {
  const key = await getSetting('apiKey', '')
  if (key && navigator.onLine) {
    try {
      return await classify(await aiCopy(photo.full), key, await getSetting('model', DEFAULT_MODEL))
    } catch (e) {
      toast(`Gemini hiccup (${(e as Error).message}), so I sorted it on-device.`)
    }
  }
  return classifyLocally(photo)
}

const inflight = new Set<string>()

/** Sorts one pending photo. Resolves undefined when skipped (busy, gone, already done); throws if sorting failed. */
export async function sortPhoto(id: string): Promise<Photo | undefined> {
  if (inflight.has(id)) return
  inflight.add(id)
  try {
    const photo = await db.photos.get(id)
    if (photo?.status !== 'pending') return
    const ai = await describe(photo)
    // Re-read inside the write: the user may have moved or captioned it while the AI was thinking.
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
