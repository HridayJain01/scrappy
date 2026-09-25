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
