import { useEffect, useRef, useState } from 'react'
import { ALBUMS, CATEGORIES, db, diaryDate, scopePhotos, useLive, type Category } from '../lib/db.ts'
import { shareFile, toast } from '../lib/fx.ts'
import { blobUrl, forgetUrls } from './ui.tsx'

/** Full-screen photo: pinch to zoom, swipe to move through its album/day/month. No rotation, no decoration on the image. */
export function PhotoView({ scope, id }: { scope: string; id: string }) {
  const photo = useLive(() => db.photos.get(id).then((p) => p ?? null), [id])
  // Snapshot of the list at open time, so moving a photo out of this album doesn't break swiping.
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    scopePhotos(scope).then((list) => setIds(list.map((p) => p.id)))
  }, [scope])
  const [picking, setPicking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => (setPicking(false), setConfirming(false)), [id])

  const stage = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const view = useRef({ s: 1, tx: 0, ty: 0, dx: 0 }) // zoom, pan, swipe offset
  const nav = useRef({ ids, id, scope })
  nav.current = { ids, id, scope }

  const apply = (animate = false) => {
    const { s, tx, ty, dx } = view.current
    if (!img.current) return
    img.current.style.transition = animate ? 'transform .25s ease-out' : 'none'
    img.current.style.transform = `translate3d(${tx + dx}px, ${ty}px, 0) scale(${s})`
  }

  /** dir 1 = next, -1 = previous. Slides the current photo out; the new one slides in on load. */
  const go = (dir: number) => {
    const { ids, id, scope } = nav.current
    const i = ids.indexOf(id)
    const target = i < 0 ? undefined : ids[i + dir]
    if (!target) return false
    view.current = { s: 1, tx: 0, ty: 0, dx: -dir * (stage.current?.clientWidth ?? 400) }
    apply(true)
    location.replace(`#/photo/${scope}/${target}`)
    return true
  }

  const onLoad = () => {
    const from = -Math.sign(view.current.dx) // came from the right after "next", from the left after "prev"
    view.current = { s: 1, tx: 0, ty: 0, dx: from * (stage.current?.clientWidth ?? 400) }
    apply()
    img.current?.getBoundingClientRect() // commit the start position before animating
    view.current.dx = 0
    apply(!!from)
  }

  // Pointer gestures: two fingers pinch (zooming around the fingers), one finger pans when zoomed or swipes when not.
  useEffect(() => {
    const el = stage.current!
    const pts = new Map<number, { x: number; y: number }>()
    let pinch: { d: number; s: number; mx: number; my: number; tx: number; ty: number } | undefined
    const box = () => el.getBoundingClientRect()
    const clamp = () => {
      const r = box()
      const v = view.current
      const mx = (r.width * (v.s - 1)) / 2
      const my = (r.height * (v.s - 1)) / 2
      v.tx = Math.max(-mx, Math.min(mx, v.tx))
      v.ty = Math.max(-my, Math.min(my, v.ty))
    }
    const mid = () => {
      const [a, b] = [...pts.values()]
      const r = box()
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left - r.width / 2, my: (a.y + b.y) / 2 - r.top - r.height / 2 }
    }
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) pinch = { ...mid(), s: view.current.s, tx: view.current.tx, ty: view.current.ty }
      if (e.pointerType === 'mouse') el.setPointerCapture(e.pointerId) // touch pointers are captured implicitly
    }
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId)
      if (!prev) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const v = view.current
      if (pinch && pts.size === 2) {
        const m = mid()
        v.s = Math.min(5, Math.max(1, (pinch.s * m.d) / pinch.d))
        const k = v.s / pinch.s
        v.tx = m.mx - (pinch.mx - pinch.tx) * k
        v.ty = m.my - (pinch.my - pinch.ty) * k
        clamp()
      } else if (v.s > 1) {
        v.tx += e.clientX - prev.x
        v.ty += e.clientY - prev.y
        clamp()
      } else v.dx += e.clientX - prev.x
      apply()
    }
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      pinch = undefined
      if (pts.size) return
      const v = view.current
      if (v.s < 1.05) Object.assign(v, { s: 1, tx: 0, ty: 0 })
      const dir = v.dx < -70 ? 1 : v.dx > 70 ? -1 : 0
      if (!dir || !go(dir)) {
        v.dx = 0
        apply(true)
      }
    }
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input')) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'Escape') history.back()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      removeEventListener('keydown', key)
    }
    // go/apply only read refs, so wiring them once is enough.
  }, [])

  async function move(category: Category) {
    await db.photos.update(id, { category, manual: true })
    setPicking(false)
    toast(`Moved to ${ALBUMS[category].name} ${ALBUMS[category].emoji}`)
  }

  async function remove() {
    const i = ids.indexOf(id)
    const next = ids[i + 1] ?? ids[i - 1]
    await db.photos.delete(id)
    forgetUrls(id)
    toast('Photo deleted 🗑️')
    if (!next) return history.back()
    setIds(ids.filter((x) => x !== id))
    location.replace(`#/photo/${scope}/${next}`)
  }

  const album = photo ? ALBUMS[photo.category] : undefined
  const action = 'btn flex-col gap-0 px-2 py-1.5 text-sm'
  const index = ids.indexOf(id)
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-paper" role="dialog" aria-modal="true" aria-label={photo?.title || 'Photo'}>
      <div ref={stage} className="relative h-[68svh] touch-none overflow-hidden bg-ink select-none">
        {photo && (
          <img
            ref={img}
            src={blobUrl(photo, 'full')}
            onLoad={onLoad}
            alt={photo.title || photo.caption || 'Photo'}
            draggable={false}
            className="size-full object-contain will-change-transform"
          />
        )}
        {photo === null && <p className="grid size-full place-items-center p-6 text-center font-hand text-3xl text-white">This photo has left the scrapbook.</p>}
        <button onClick={() => history.back()} className="btn absolute top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 bg-white text-xl" aria-label="Close" autoFocus>
          ✕
        </button>
        {ids.length > 1 && index >= 0 && (
          <span className="card absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 bg-sun px-3 py-2 text-sm font-bold">
            {index + 1} / {ids.length}
          </span>
        )}
      </div>

      {photo && album && (
        <section className="mx-auto max-w-lg space-y-5 p-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="heading text-4xl break-words">{photo.title || 'Waiting to be sorted…'}</h2>
              <p className="font-hand text-2xl">
                {diaryDate(photo.day)} · {new Date(photo.takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {photo.sticker && (
              <span className="text-5xl" role="img" aria-label="Sticker">
                {photo.sticker}
              </span>
            )}
          </div>

          <label className="block">
            <span className="sr-only">Caption</span>
            <textarea
              key={photo.id + photo.status}
              defaultValue={photo.caption}
              onBlur={(e) => e.target.value !== (photo.caption ?? '') && db.photos.update(photo.id, { caption: e.target.value.trim() })}
              rows={2}
              placeholder="Write a caption…"
              className="field resize-none font-hand text-2xl leading-tight"
            />
          </label>

          {photo.extra?.value && (
            <p className="card w-fit -rotate-1 bg-sun px-4 py-2">
              <b className="heading text-xl">{photo.extra.label}:</b> <span className="font-hand text-2xl">{photo.extra.value}</span>
            </p>
          )}

          {!!photo.tags?.length && (
            <ul className="flex flex-wrap gap-2" aria-label="Tags">
              {photo.tags.map((t) => (
                <li key={t} className="rounded-full border-2 border-ink bg-white px-3 py-1 text-sm font-bold">
                  #{t}
                </li>
              ))}
            </ul>
          )}

          <div>
            <button className="btn" style={{ background: album.color }} onClick={() => setPicking(!picking)} aria-expanded={picking}>
              {album.emoji} {album.name} <span aria-hidden>▾</span>
            </button>
            {picking && (
              <div className="rise mt-4 grid grid-cols-2 gap-3">
                <p className="col-span-2 font-bold">Move to…</p>
                {CATEGORIES.filter((c) => c !== photo.category).map((c) => (
                  <button key={c} className="btn" style={{ background: ALBUMS[c].color }} onClick={() => move(c)}>
                    {ALBUMS[c].emoji} {ALBUMS[c].name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button className={`${action} bg-blue`} onClick={() => shareFile(photo.full, `${photo.title?.replace(/[^\w -]+/g, '').trim() || 'scrappy'}.jpg`, photo.caption)}>
              <span className="text-xl" aria-hidden>📤</span> Share
            </button>
            <button className={`${action} bg-white`} onClick={() => setPicking(true)}>
              <span className="text-xl" aria-hidden>📁</span> Move
            </button>
            <button className={`${action} bg-tomato`} onClick={() => setConfirming(true)}>
              <span className="text-xl" aria-hidden>🗑️</span> Delete
            </button>
          </div>

          {confirming && (
            <div className="card rise bg-white p-4" role="alertdialog" aria-label="Confirm delete">
              <p className="mb-3 font-bold">Delete this photo forever? There's no undo.</p>
              <div className="flex gap-3">
                <button className="btn bg-tomato" onClick={remove}>
                  Yes, delete
                </button>
                <button className="btn bg-white" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
