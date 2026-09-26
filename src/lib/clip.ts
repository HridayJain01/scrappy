// Main-thread side of the on-device AI: CLIP preprocessing here, the model runs in clip.worker.ts.
import type { Photo } from './db.ts'
import type { AiResult } from './gemini.ts'
import { decode } from './images.ts'
import { MODEL, score, writeUp } from './vocab.ts'

let worker: Worker | undefined
let nextId = 1
const waiting = new Map<number, (reply: { sims?: Float32Array; error?: string }) => void>()
let progress = 0 // model download: 0…1, 1 = loaded

export const modelProgress = () => progress
export const isModelCached = async () => !!self.caches && !!(await (await caches.open(MODEL.cache)).match(MODEL.url))

function send(pixels?: Float32Array) {
  if (!worker) {
    worker = new Worker(new URL('./clip.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if ('progress' in data) {
        progress = data.progress
        return dispatchEvent(new CustomEvent('ai-progress'))
      }
      waiting.get(data.id)?.(data)
      waiting.delete(data.id)
    }
  }
  const id = nextId++
  return new Promise<Float32Array | undefined>((ok, fail) => {
    waiting.set(id, (r) => (r.error ? fail(new Error(r.error)) : ok(r.sims)))
    worker!.postMessage({ id, pixels }, pixels ? [pixels.buffer] : [])
  })
}

/** Starts the one-time model download in the background. Failures (offline) just retry on next use. */
export const warmUp = () => send().catch(() => {})

// CLIP's preprocessing: centre square → 224×224, then normalise with CLIP's per-channel mean/std into CHW floats.
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]
async function pixels(blob: Blob) {
  const img = await decode(blob)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const c = document.createElement('canvas')
  c.width = c.height = 224
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 224, 224)
  const { data } = g.getImageData(0, 0, 224, 224)
  c.width = c.height = 0
  const px = 224 * 224
  const out = new Float32Array(3 * px)
  for (let i = 0; i < px; i++) for (let ch = 0; ch < 3; ch++) out[ch * px + i] = (data[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch]
  return out
}

/** Sorts and captions a photo entirely on this device. A different `seed` picks different words for the same photo. */
export async function classifyLocally(photo: Pick<Photo, 'id' | 'thumb' | 'takenAt'>, seed = photo.id): Promise<AiResult> {
  const sims = await send(await pixels(photo.thumb))
  return writeUp(score(sims!), seed, photo.takenAt)
}
