// Precomputes CLIP text embeddings for every label in src/lib/vocab.ts, so phones only download the image model.
// Run after editing the vocabulary (the text model is ~250 MB, downloaded once into ~/.cache):
//   npm i --no-save @huggingface/transformers && node scripts/embed-labels.ts
import { AutoTokenizer, CLIPTextModelWithProjection, env } from '@huggingface/transformers'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { LABELS, MODEL } from '../src/lib/vocab.ts'

env.cacheDir = process.env.HF_CACHE ?? `${homedir()}/.cache/huggingface-transformers`
const texts = LABELS.map((l) => l.text)
const tokenizer = await AutoTokenizer.from_pretrained(MODEL.id)
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL.id, { dtype: 'fp32' })
const { text_embeds } = await model(tokenizer(texts, { padding: true, truncation: true }))
const vectors: number[][] = text_embeds.normalize(2, -1).tolist()

// int8 with one scale per vector: ~110 KB instead of ~440 KB of float32, and plenty precise for ranking.
const scales = vectors.map((v) => Math.max(...v.map(Math.abs)) / 127)
const bytes = new Int8Array(vectors.flatMap((v, i) => v.map((x) => Math.round(x / scales[i]))))
const out = { model: MODEL.id, dims: vectors[0].length, texts, scales, data: Buffer.from(bytes.buffer).toString('base64') }
writeFileSync(new URL('../src/lib/label-embeddings.json', import.meta.url), JSON.stringify(out))
console.log(`Embedded ${texts.length} labels → src/lib/label-embeddings.json`)
