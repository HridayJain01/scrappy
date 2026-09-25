import { CATEGORIES, type Category } from './db.ts'

export const DEFAULT_MODEL = 'gemini-2.5-flash-lite'

export interface AiResult {
  category: Category
  title: string
  caption: string
  tags: string[]
  sticker: string
  extra: { label: string; value: string }
}

const PROMPT = `You are the narrator of a personal, playful photo scrapbook. Look at this photo and return JSON only.
- category: 'fits' if the main subject is an outfit or a person showing what they're wearing; 'food' if food or drink is the main subject; 'views' for a place, landscape, sky, street, building or scenery; 'random' for anything else. If torn between two, pick whichever best describes the main subject.
- title: 2-5 words, catchy, like a scrapbook heading.
- caption: one short diary-style line in first person, warm and witty, max 15 words. Never comment negatively on anyone's body or looks.
- tags: 3-5 lowercase keywords.
- sticker: one emoji that fits the photo.
- extra: for fits → label 'Fit score', value like '8/10 · main character energy'; for food → label 'Dish', value = best guess of the dish name; for views → label 'Vibe', value = 2-3 words like 'golden hour calm'; for random → label 'Weirdness', value like '4/5 · why is this here'.`

const STR = { type: 'STRING' }
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', enum: CATEGORIES },
    title: STR,
    caption: STR,
    tags: { type: 'ARRAY', items: STR },
    sticker: STR,
    extra: { type: 'OBJECT', properties: { label: STR, value: STR }, required: ['label', 'value'] },
  },
  required: ['category', 'title', 'caption', 'tags', 'sticker', 'extra'],
  propertyOrdering: ['category', 'title', 'caption', 'tags', 'sticker', 'extra'], // Gemini otherwise sorts keys alphabetically
}

const modelUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.trim().replace(/^models\//, ''))}`

async function call(url: string, key: string, body?: unknown) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, // header, so the key never lands in a URL
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45_000),
  }).catch((e: Error) => {
    throw new Error(e.name === 'TimeoutError' ? 'Gemini took too long to answer' : "Couldn't reach Gemini. Are you online?")
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`)
  return data
}

/** Checks the key and the model name without spending a generate request. */
export const testKey = (key: string, model: string) => call(modelUrl(model), key)

export async function classify(jpeg: Blob, key: string, model: string): Promise<AiResult> {
  const data = await call(`${modelUrl(model)}:generateContent`, key, {
    contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: await toBase64(jpeg) } }, { text: PROMPT }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
  })
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new Error(data.promptFeedback?.blockReason ? `Gemini refused this one (${data.promptFeedback.blockReason})` : 'Gemini sent back nothing')
  return parseResult(text)
}

/** Model output is untrusted: validate the shape and clamp every field. */
export function parseResult(text: string): AiResult {
  let r: any // untrusted until checked below
  try {
    r = JSON.parse(text)
  } catch {
    throw new Error('Gemini sent back gibberish')
  }
  if (!CATEGORIES.includes(r?.category)) throw new Error(`Gemini picked an unknown album: ${r?.category}`)
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const tags: unknown[] = Array.isArray(r.tags) ? r.tags : []
  return {
    category: r.category,
    title: str(r.title, 60) || 'Untitled',
    caption: str(r.caption, 160),
    tags: tags.map((t) => str(t, 30).toLowerCase()).filter(Boolean).slice(0, 5),
    sticker: str(r.sticker, 16) || '✨',
    extra: { label: str(r.extra?.label, 30), value: str(r.extra?.value, 80) },
  }
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1])
    r.onerror = () => fail(r.error)
    r.readAsDataURL(blob)
  })
