import { useState } from 'react'
import { ALBUMS, CATEGORIES, dayKey, monthLabel, monthPhotos, shiftMonth, tilt, useLive, type AlbumId, type Photo } from '../lib/db.ts'
import { shareFile, toast } from '../lib/fx.ts'
import { decode, toJpeg } from '../lib/images.ts'
import { Polaroid } from './ui.tsx'

/** Up to n photos spread evenly across the month. */
const spread = (photos: Photo[], n = 9) => (photos.length <= n ? photos : Array.from({ length: n }, (_, i) => photos[Math.floor((i * photos.length) / n)]))

function topSticker(photos: Photo[]) {
  const counts = new Map<string, number>()
  for (const p of photos) if (p.sticker) counts.set(p.sticker, (counts.get(p.sticker) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]
}

export function Recap() {
  const [month, setMonth] = useState(() => dayKey().slice(0, 7))
  const photos = useLive(() => monthPhotos(month), [month])
  const [busy, setBusy] = useState(false)
  const list = photos ?? []
  const counts = ([...CATEGORIES, 'unsorted'] as AlbumId[])
    .map((id) => [id, list.filter((p) => p.category === id).length] as const)
    .filter(([id, n]) => id !== 'unsorted' || n)
  const top = topSticker(list)
  const picks = spread(list)
  const label = monthLabel(month)
  const thisMonth = dayKey().slice(0, 7)

  async function share() {
    setBusy(true)
    try {
      await shareFile(await renderRecap(label, list.length, counts, top, picks), `scrappy-recap-${month}.jpg`, `My ${label} in Scrappy`)
    } catch (e) {
      toast(`Couldn't make the image: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <>
      <h1 className="heading text-6xl">Recap</h1>
      <div className="my-5 flex items-center gap-2">
        <button className="btn bg-white" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          ◀
        </button>
        <input
          type="month"
          value={month}
          max={thisMonth}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="field min-w-0 flex-1 text-center font-bold"
          aria-label="Month"
        />
        <button className="btn bg-white" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} aria-label="Next month">
          ▶
        </button>
      </div>

      <article className="card relative bg-white p-5 pt-7">
        <span className="tape bg-pink" aria-hidden />
        <h2 className="heading w-fit -rotate-1 rounded-lg border-3 border-ink bg-sun px-3 pt-1 text-4xl">{label}</h2>
        {photos && !list.length ? (
          <p className="mt-4 font-hand text-3xl leading-tight">No photos this month. Blank pages are sad pages.</p>
        ) : (
          <>
            <p className="mt-3 font-hand text-3xl">
              {list.length} photo{list.length === 1 ? '' : 's'} in the scrapbook
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {counts.map(([id, n]) => (
                <li key={id} className="rounded-full border-3 border-ink px-3 py-1 font-bold" style={{ background: ALBUMS[id].color }}>
                  {ALBUMS[id].emoji} {ALBUMS[id].name} · {n}
                </li>
              ))}
            </ul>
            {top && (
              <p className="mt-4 font-hand text-3xl">
                Most-used sticker: {top[0]} ×{top[1]}
              </p>
            )}
            <div className="mt-6 grid grid-cols-3 items-start gap-3">
              {picks.map((p) => (
                <Polaroid key={p.id} photo={p} href={`#/photo/m:${month}/${p.id}`} small />
              ))}
            </div>
          </>
        )}
      </article>

      {!!list.length && (
        <button className="btn mt-6 w-full bg-pink text-lg" onClick={share} disabled={busy}>
          {busy ? 'Gluing it together…' : '📤 Share as image'}
        </button>
      )}
    </>
  )
}

/** Draws the recap page onto a 1080px-wide canvas. */
async function renderRecap(label: string, total: number, counts: (readonly [AlbumId, number])[], top: [string, number] | undefined, picks: Photo[]) {
  await Promise.all(['100px Bangers', '50px Caveat'].map((f) => document.fonts.load(f)))
  const W = 1080
  const P = 70
  const gap = 40
  const tile = (W - P * 2 - gap * 2) / 3
  const frame = 16
  const tileH = tile + 64
  const gridTop = 560
  const H = gridTop + Math.ceil(picks.length / 3) * (tileH + gap) + 110
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const box = (x: number, y: number, w: number, h: number, fill: string) => {
    g.fillStyle = '#111'
    g.fillRect(x + 9, y + 9, w, h)
    g.fillStyle = fill
    g.fillRect(x, y, w, h)
    g.lineWidth = 6
    g.strokeRect(x, y, w, h)
  }

  g.fillStyle = '#FFF6E5'
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(17,17,17,.13)'
  for (let y = 20; y < H; y += 40) for (let x = 20; x < W; x += 40) g.fillRect(x - 2, y - 2, 4, 4)

  g.textBaseline = 'middle'
  g.strokeStyle = '#111'
  g.font = '100px Bangers'
  const title = label.toUpperCase()
  box(P, 60, g.measureText(title).width + 60, 140, '#FFD23F')
  g.fillStyle = '#111'
  g.fillText(title, P + 30, 136)
  g.font = '54px Caveat'
  g.fillText(`${total} photo${total === 1 ? '' : 's'} in my scrapbook`, P, 262)

  const bw = (W - P * 2 - 24 * (counts.length - 1)) / counts.length
  counts.forEach(([id, n], i) => {
    const x = P + i * (bw + 24)
    box(x, 320, bw, 110, ALBUMS[id].color)
    g.fillStyle = '#111'
    g.font = '52px sans-serif'
    g.fillText(ALBUMS[id].emoji, x + 18, 378)
    g.font = '64px Bangers'
    g.fillText(String(n), x + 90, 380)
  })
  if (top) {
    g.font = '54px Caveat'
    g.fillText(`Most-used sticker: ${top[0]} ×${top[1]}`, P, 490)
  }

  const images = await Promise.all(picks.map((p) => decode(p.thumb)))
  images.forEach((im, i) => {
    const x = P + (i % 3) * (tile + gap)
    const y = gridTop + Math.floor(i / 3) * (tileH + gap)
    g.save()
    g.translate(x + tile / 2, y + tileH / 2)
    g.rotate((tilt(picks[i].id) * Math.PI) / 180)
    g.translate(-tile / 2, -tileH / 2)
    box(0, 0, tile, tileH, '#fff')
    const side = Math.min(im.naturalWidth, im.naturalHeight) // centre-crop to a square
    g.drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, frame, frame, tile - frame * 2, tile - frame * 2)
    g.fillStyle = '#111'
    g.font = '36px sans-serif'
    g.fillText(picks[i].sticker ?? '', tile - 58, tileH - 26)
    g.restore()
  })

  g.fillStyle = '#111'
  g.font = '46px Caveat'
  g.fillText('made with Scrappy 📸', P, H - 56)
  return toJpeg(c, 0.92)
}
