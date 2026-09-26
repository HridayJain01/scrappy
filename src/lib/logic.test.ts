// Run with `npm test` (Node's built-in runner; Node strips the TypeScript itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diaryDate, flashbackDays, shiftMonth, streakFrom, tilt } from './db.ts'
import { parseResult } from './gemini.ts'

test('streak counts back from today, or from yesterday until you snap today', () => {
  assert.equal(streakFrom(['2026-09-23', '2026-09-24', '2026-09-25'], '2026-09-25'), 3)
  assert.equal(streakFrom(['2026-09-23', '2026-09-24'], '2026-09-25'), 2)
  assert.equal(streakFrom(['2026-09-22', '2026-09-24', '2026-09-25'], '2026-09-25'), 2)
  assert.equal(streakFrom(['2026-09-20'], '2026-09-25'), 0)
  assert.equal(streakFrom(['2026-02-28', '2026-03-01'], '2026-03-01'), 2) // across a month end
  assert.equal(streakFrom(['2025-12-31', '2026-01-01'], '2026-01-01'), 2) // across a year end
})

test('flashback days: same date last month and last year', () => {
  assert.deepEqual(
    flashbackDays('2026-09-25').map((f) => f.day),
    ['2026-08-25', '2025-09-25'],
  )
  assert.deepEqual(
    flashbackDays('2026-01-05').map((f) => f.day),
    ['2025-12-05', '2025-01-05'],
  )
  assert.equal(flashbackDays('2026-03-31')[0].day, '2026-02-31') // matches nothing, on purpose
})

test('dates and months', () => {
  assert.match(diaryDate('2026-09-22'), /^Tue, 22 Sep/)
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
})

test('tilt stays within ±2° and is stable', () => {
  for (const id of ['a', 'mfz3k2', 'x'.repeat(40), 'lq9w0e1r2t']) {
    assert.ok(Math.abs(tilt(id)) <= 2)
    assert.equal(tilt(id), tilt(id))
  }
})

test('parseResult validates and clamps model output', () => {
  const ok = parseResult(
    JSON.stringify({
      category: 'food',
      title: '  Noodle Night ',
      caption: 'I regret nothing.',
      tags: ['Ramen', 42, '', 'dinner', 'a', 'b', 'c'],
      sticker: '🍜',
      extra: { label: 'Dish', value: 'Tonkotsu ramen' },
    }),
  )
  assert.equal(ok.category, 'food')
  assert.equal(ok.title, 'Noodle Night')
  assert.deepEqual(ok.tags, ['ramen', 'dinner', 'a', 'b', 'c'])
  assert.deepEqual(ok.extra, { label: 'Dish', value: 'Tonkotsu ramen' })

  const sparse = parseResult('{"category":"views"}')
  assert.equal(sparse.title, 'Untitled')
  assert.equal(sparse.sticker, '✨')
  assert.deepEqual(sparse.tags, [])

  assert.throws(() => parseResult('{"category":"cats"}'), /unknown album/)
  assert.throws(() => parseResult('not json'), /gibberish/)
})

test('label embeddings match the vocabulary (run scripts/embed-labels.ts after editing labels)', async () => {
  const { LABELS } = await import('./vocab.ts')
  const { default: emb } = await import('./label-embeddings.json', { with: { type: 'json' } })
  assert.deepEqual(emb.texts, LABELS.map((l) => l.text))
  assert.equal(emb.scales.length, LABELS.length)
  assert.equal(Buffer.from(emb.data, 'base64').length, LABELS.length * emb.dims)
})

test('score picks the album with the most probability and names the best label', async () => {
  const { LABELS, score } = await import('./vocab.ts')
  const sims = LABELS.map((l) => (l.name === 'biryani' ? 0.32 : l.name === 'curry' ? 0.315 : 0.2))
  const s = score(sims)
  assert.equal(s.category, 'food')
  assert.equal(s.best.name, 'biryani')
  assert.deepEqual(s.runnerUps.map((l) => l.name), ['curry'])
  // A flat, uncertain result falls back to a generic label instead of guessing a name.
  const flat = score(LABELS.map(() => 0.2))
  assert.equal(flat.best.name, undefined)
})

test('writeUp stays within the caption rules for every label', async () => {
  const { LABELS, writeUp } = await import('./vocab.ts')
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length
  for (const [i, best] of LABELS.entries()) {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const r = writeUp({ category: best.cat, confidence: 1, best, runnerUps: [] }, seed + i, new Date(2026, 8, 26, 9).getTime())
      const text = `${r.title} ${r.caption} ${r.extra.value}`
      assert.equal(r.category, best.cat)
      assert.ok(!/[{}]/.test(text), `unfilled template: ${text}`)
      assert.ok(words(r.title) >= 1 && words(r.title) <= 5, `title: ${r.title}`)
      assert.ok(words(r.caption) <= 15, `caption: ${r.caption}`)
      assert.ok(r.tags.length >= 1 && r.tags.length <= 5 && r.tags.every((t) => t === t.toLowerCase()), `tags: ${r.tags}`)
      assert.ok(r.sticker && r.extra.label && r.extra.value)
    }
  }
  // Same photo, same words.
  const best = LABELS.find((l) => l.name === 'pizza')!
  const once = writeUp({ category: 'food', confidence: 1, best, runnerUps: [] }, 'photo-1', 0)
  assert.deepEqual(writeUp({ category: 'food', confidence: 1, best, runnerUps: [] }, 'photo-1', 0), once)
})

test('time-of-day tags follow the clock', async () => {
  const { LABELS, writeUp } = await import('./vocab.ts')
  const at = (h: number) => new Date(2026, 8, 26, h).getTime()
  const food = { category: 'food' as const, confidence: 1, best: LABELS.find((l) => l.name === 'biryani')!, runnerUps: [] }
  assert.ok(writeUp(food, 'x', at(1)).tags.includes('midnight snack'))
  assert.ok(writeUp(food, 'x', at(8)).tags.includes('breakfast'))
  assert.ok(writeUp(food, 'x', at(20)).tags.includes('dinner'))
  const view = { category: 'views' as const, confidence: 1, best: LABELS.find((l) => l.name === 'beach')!, runnerUps: [] }
  assert.ok(writeUp(view, 'x', at(1)).tags.includes('night'))
  assert.ok(writeUp(view, 'x', at(12)).tags.includes('daytime'))
})

test('your albums grab photos by keyword, otherwise the AI picks', async () => {
  const { routeAlbum } = await import('./db.ts')
  const pets = { id: 'pets', name: 'Pets', emoji: '🐾', color: '#9B5DE5', burst: 'AWW!', keywords: ['cats', 'Dog'] }
  const coffee = { id: 'coffee', name: 'Coffee', emoji: '☕', color: '#C9ADA7', burst: 'SIP!', keywords: ['latte', 'coffee'] }
  const builtin = { id: 'food', name: 'Food Diary', emoji: '🍜', color: '#FF5A36', burst: 'YUM!', builtin: true }
  assert.equal(routeAlbum([builtin, pets, coffee], { category: 'random', tags: ['cat', 'animals'] }), 'pets') // "cats" ~ "cat"
  assert.equal(routeAlbum([pets, coffee], { category: 'food', tags: ['hot dog', 'food'] }), 'food') // "dog" isn't "hot dog"
  assert.equal(routeAlbum([pets, coffee], { category: 'food', tags: ['latte', 'drinks'] }), 'coffee')
  assert.equal(routeAlbum([coffee, pets], { category: 'random', tags: ['dog', 'coffee'] }), 'coffee') // first match wins
  assert.equal(routeAlbum([pets], { category: 'views', tags: [] }), 'views')
})
