// Runs the CLIP image encoder off the main thread, so the booth animation stays smooth.
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import labels from './label-embeddings.json'
import { MODEL } from './vocab.ts'

ort.env.wasm.numThreads = 1 // threads need cross-origin isolation headers; one is plenty for one photo at a time
ort.env.wasm.wasmPaths = { wasm: wasmUrl } // bundled with the app and precached by the service worker

const post = (msg: object, transfer: Transferable[] = []) => self.postMessage(msg, { transfer })

/** Downloads once into Cache Storage, then serves from there (so sorting works offline). */
async function cached(url: string, onBytes?: (n: number) => void) {
  const cache = self.caches && (await caches.open(MODEL.cache)) // no Cache Storage on plain-http LAN testing
  const hit = await cache?.match(url)
  if (hit) return new Uint8Array(await hit.arrayBuffer())
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const chunks: Uint8Array[] = []
  let got = 0
  for (const reader = res.body.getReader(); ; ) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    onBytes?.((got += value.length))
  }
  const bytes = new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer())
  await cache?.put(url, new Response(bytes))
  return bytes
}

async function load() {
  const model = await cached(MODEL.url, (n) => post({ progress: Math.min(0.99, n / MODEL.bytes) }))
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
  post({ progress: 1 })
  return session
}
let session: Promise<ort.InferenceSession> | undefined

// Label embeddings: int8 with one scale per label (see scripts/embed-labels.ts).
const D = labels.dims
const q = new Int8Array(Uint8Array.from(atob(labels.data), (c) => c.charCodeAt(0)).buffer)

function similarities(image: Float32Array) {
  const norm = Math.hypot(...image)
  const out = new Float32Array(labels.scales.length)
  for (let i = 0; i < out.length; i++) {
    let s = 0
    for (let k = 0; k < D; k++) s += image[k] * q[i * D + k]
    out[i] = (s * labels.scales[i]) / norm
  }
  return out
}

// Message in: { id, pixels? } (no pixels = just load the model). Out: { progress } | { id, sims } | { id, error }.
self.onmessage = async ({ data: { id, pixels } }: MessageEvent<{ id: number; pixels?: Float32Array }>) => {
  try {
    const s = await (session ??= load())
    if (!pixels) return post({ id })
    const out = await s.run({ pixel_values: new ort.Tensor('float32', pixels, [1, 3, 224, 224]) })
    const sims = similarities(out.image_embeds.data as Float32Array)
    post({ id, sims }, [sims.buffer])
  } catch (e) {
    session = undefined // e.g. offline before the first download: try again next time
    post({ id, error: (e as Error).message })
  }
}
