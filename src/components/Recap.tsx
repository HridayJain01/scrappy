import { useEffect, useState } from 'react'
import { allDays, dayKey, db, fromKey, getSetting, hiddenAlbums, longestStreak, monthLabel, monthPhotos, shiftMonth, tilt, useLive, yearPhotos, type Photo } from '../lib/db.ts'
import { BADGES, type Stats } from '../lib/fun.ts'
import { shareFile, toast } from '../lib/fx.ts'
import { decode, toJpeg } from '../lib/images.ts'
import { blobUrl, Polaroid, useAlbums, useBackToClose } from './ui.tsx'

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
  const [playing, setPlaying] = useState(false)
  const list = photos ?? []
  const top = topSticker(list)
  const picks = spread(list)
  const label = monthLabel(month)
  const thisMonth = dayKey().slice(0, 7)

  async function share() {
    setBusy(true)
    try {
      await shareFile(await renderRecap(label, list.length, top, picks), `scrappy-recap-${month}.jpg`, `My ${label} in Scrappy`)
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
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className="btn bg-sun text-lg" onClick={() => setPlaying(true)}>
            ▶️ Slideshow
          </button>
          <button className="btn bg-pink text-lg" onClick={share} disabled={busy}>
            {busy ? 'Gluing…' : '📤 Share image'}
          </button>
        </div>
      )}
      {playing && <Slideshow photos={list} onClose={() => setPlaying(false)} />}

      <YearInPixels />
      <BadgeShelf />
      <StickerBook />
    </>
  )
}

/** Full-screen, one photo every few seconds with its caption. Tap to pause. */
function Slideshow({ photos, onClose }: { photos: Photo[]; onClose: () => void }) {
  const close = useBackToClose(onClose)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => (i + 1 < photos.length ? setI(i + 1) : close()), 3500)
    return () => clearTimeout(t)
  }, [i, paused])
  const p = photos[i]
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-white" role="dialog" aria-modal="true" aria-label="Slideshow" onClick={() => setPaused(!paused)}>
      <div className="flex items-center justify-between p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button className="btn bg-white text-xl text-ink" onClick={(e) => (e.stopPropagation(), close())} aria-label="Close" autoFocus>
          ✕
        </button>
        <span className="card bg-sun px-3 py-2 text-sm font-bold text-ink">
          {paused ? '⏸ ' : ''}
          {i + 1} / {photos.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2 px-3">
        <button className="w-10 shrink-0 text-3xl" onClick={(e) => (e.stopPropagation(), setI(Math.max(0, i - 1)))} aria-label="Previous">
          ‹
        </button>
        <img key={p.id} src={blobUrl(p, 'full')} alt={p.title || p.caption || 'Photo'} className="rise min-h-0 min-w-0 flex-1 object-contain" />
        <button className="w-10 shrink-0 text-3xl" onClick={(e) => (e.stopPropagation(), setI(Math.min(photos.length - 1, i + 1)))} aria-label="Next">
          ›
        </button>
      </div>
      <p key={p.id + 'c'} className="rise p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] text-center font-hand text-3xl leading-tight">
        {p.sticker} {p.caption || p.title}
      </p>
    </div>
  )
}

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Every day of the year as a pixel, coloured by the album you photographed most that day. */
function YearInPixels() {
  const [year, setYear] = useState(() => dayKey().slice(0, 4))
  const albums = useAlbums()
  const days = useLive(async () => {
    const byDay = new Map<string, Photo[]>()
    for (const p of await yearPhotos(year)) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p])
    return byDay
  }, [year])
  const today = dayKey()
  const thisYear = today.slice(0, 4)
  const used = new Set<string>()
  const pixel = (day: string) => {
    const list = days?.get(day)
    if (!list) return undefined
    const n = new Map<string, number>()
    for (const p of list) n.set(p.category, (n.get(p.category) ?? 0) + 1)
    const top = [...n].sort((a, b) => b[1] - a[1])[0][0]
    used.add(top)
    return { album: albums.get(top), first: list[0], count: list.length }
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const cells = Array.from({ length: 31 }, (_, d) =>
    Array.from({ length: 12 }, (_, m) => {
      const day = `${year}-${pad(m + 1)}-${pad(d + 1)}`
      const real = fromKey(day).getMonth() === m // Feb 30 etc. don't exist
      return { day, real, px: real ? pixel(day) : undefined }
    }),
  )

  return (
    <section className="card relative mt-10 bg-white p-4 pt-6">
      <span className="tape bg-mint" aria-hidden />
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="heading text-2xl">🗓️ Year in pixels</h2>
        <div className="flex items-center gap-1">
          <button className="btn min-h-10 min-w-10 bg-white px-2" onClick={() => setYear(String(+year - 1))} aria-label="Previous year">
            ◀
          </button>
          <span className="heading text-2xl">{year}</span>
          <button className="btn min-h-10 min-w-10 bg-white px-2" onClick={() => setYear(String(+year + 1))} disabled={year >= thisYear} aria-label="Next year">
            ▶
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[1.25rem_repeat(12,1fr)] gap-[3px] text-center text-[10px] font-bold">
        <span />
        {MONTH_LETTERS.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
        {cells.map((row, d) => [
          <span key={`d${d}`} className="leading-4">
            {(d + 1) % 5 === 1 ? d + 1 : ''}
          </span>,
          ...row.map(({ day, real, px }) =>
            !real ? (
              <span key={day} />
            ) : px ? (
              <a
                key={day}
                href={`#/photo/y:${day}/${px.first.id}`}
                className="h-4 rounded-[3px] border-2 border-ink"
                style={{ background: px.album.color }}
                title={`${day}: ${px.count} photo${px.count > 1 ? 's' : ''}`}
                aria-label={`${day}, ${px.count} photo${px.count > 1 ? 's' : ''}, mostly ${px.album.name}`}
              />
            ) : (
              <span key={day} className={`h-4 rounded-[3px] border border-ink/20 ${day === today ? 'outline-2 outline-ink' : ''} ${day > today ? 'opacity-40' : ''}`} />
            ),
          ),
        ])}
      </div>
      {!!used.size && (
        <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold">
          {[...used].map((id) => (
            <li key={id} className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-[3px] border-2 border-ink" style={{ background: albums.get(id).color }} />
              {albums.get(id).emoji} {albums.get(id).name}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function BadgeShelf() {
  const stats = useLive<Stats>(async () => ({
    longest: longestStreak(await allDays()),
    photos: await db.photos.count(),
    challenges: (await getSetting<string[]>('challenges', [])).length,
    favs: await db.photos.filter((p) => !!p.fav).count(),
  }))
  if (!stats) return null
  const earned = BADGES.filter((b) => stats[b.stat] >= b.need).length
  return (
    <section className="card relative mt-10 bg-white p-4 pt-6">
      <span className="tape bg-sun" aria-hidden />
      <h2 className="heading text-3xl">🏆 Badges</h2>
      <p className="mb-4 font-hand text-2xl">
        {earned} of {BADGES.length} unlocked · best streak {stats.longest} day{stats.longest === 1 ? '' : 's'}
      </p>
      <ul className="grid grid-cols-3 gap-3">
        {BADGES.map((b) => {
          const got = stats[b.stat] >= b.need
          return (
            <li key={b.name} className={`rounded-xl border-3 p-2 text-center ${got ? 'border-ink bg-sun shadow-hard' : 'border-dashed border-ink/30 opacity-60'}`}>
              <span className={`block text-3xl ${got ? '' : 'grayscale'}`} aria-hidden>
                {got ? b.emoji : '🔒'}
              </span>
              <span className="block text-xs leading-tight font-bold">{b.name}</span>
              {!got && (
                <span className="block text-[10px]">
                  {Math.min(stats[b.stat], b.need)}/{b.need}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Every sticker the AI (or you) has given a photo, most-collected first. */
function StickerBook() {
  const book = useLive(async () => {
    const counts = new Map<string, number>()
    await db.photos.each((p) => {
      if (p.sticker && !hiddenAlbums.has(p.category)) counts.set(p.sticker, (counts.get(p.sticker) ?? 0) + 1)
    })
    return [...counts].sort((a, b) => b[1] - a[1])
  })
  if (!book?.length) return null
  return (
    <section className="card relative mt-10 bg-white p-4 pt-6">
      <span className="tape bg-pink" aria-hidden />
      <h2 className="heading text-3xl">🎨 Sticker book</h2>
      <p className="mb-4 font-hand text-2xl">
        {book.length} different sticker{book.length === 1 ? '' : 's'} collected
      </p>
      <ul className="grid grid-cols-5 gap-2">
        {book.map(([e, n]) => (
          <li key={e} className="rounded-xl border-2 border-ink bg-paper py-1 text-center">
            <span className="block text-3xl" aria-hidden>
              {e}
            </span>
            <span className="text-xs font-bold">×{n}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Draws the recap page onto a 1080px-wide canvas. */
async function renderRecap(label: string, total: number, top: [string, number] | undefined, picks: Photo[]) {
  await Promise.all(['100px Bangers', '50px Caveat'].map((f) => document.fonts.load(f)))
  const W = 1080
  const P = 70
  const gap = 40
  const tile = (W - P * 2 - gap * 2) / 3
  const frame = 16
  const tileH = tile + 64
  const gridTop = top ? 420 : 340
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

  if (top) {
    g.font = '54px Caveat'
    g.fillText(`Most-used sticker: ${top[0]} ×${top[1]}`, P, 340)
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
