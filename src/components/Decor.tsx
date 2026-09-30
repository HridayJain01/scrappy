import { useRef, useState } from 'react'
import { db, type Decor, type Photo } from '../lib/db.ts'
import { toast } from '../lib/fx.ts'
import { snapToEdge } from '../lib/fun.ts'
import { blobUrl } from './ui.tsx'

const PALETTE = ['⭐', '❤️', '✨', '🌸', '🔥', '😂', '😎', '🎉', '🦋', '🍒', '🌈', '👑', '💯', '🍀', '☀️', '🌙']

/** Stick emoji on the polaroid's frame: tap one to add it, drag to move, tap a stuck one to peel it off. */
export function Decorate({ photo, onDone }: { photo: Photo; onDone: () => void }) {
  const [decor, setDecor] = useState<Decor[]>(photo.decor ?? [])
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ i: number; moved: boolean }>(undefined)

  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, ratio: r.width / r.height }
  }

  function add(e: string) {
    if (decor.length >= 12) return toast('12 stickers max. Peel one off first!')
    const spots: [number, number][] = [[8, 0], [92, 0], [0, 50], [100, 50], [92, 100], [8, 100], [50, 0], [50, 100]]
    const [x, y] = spots[decor.length % spots.length]
    setDecor([...decor, { e, x, y }])
  }

  async function save() {
    await db.photos.update(photo.id, { decor: decor.length ? decor : undefined })
    toast('Stuck on ✓')
    onDone()
  }

  return (
    <div className="card rise space-y-4 bg-white p-4">
      <p className="font-bold">Tap a sticker to add it. Drag it around the frame, tap it to peel it off.</p>
      <div className="mx-auto w-3/5 py-4">
        <div ref={box} className="polaroid touch-none select-none" style={{ transition: 'none' }}>
          <img src={blobUrl(photo, 'thumb')} alt="" draggable={false} className="block w-full" style={{ aspectRatio: photo.ratio }} />
          <span className="block h-10" />
          {decor.map((d, i) => (
            <button
              key={i}
              type="button"
              className="absolute -translate-1/2 cursor-grab touch-none text-3xl"
              style={{ left: `${d.x}%`, top: `${d.y}%` }}
              aria-label={`Peel off ${d.e}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                drag.current = { i, moved: false }
              }}
              onPointerMove={(e) => {
                if (drag.current?.i !== i) return
                drag.current.moved = true
                const p = at(e)
                setDecor((list) => list.map((x, j) => (j === i ? { ...x, x: p.x, y: p.y } : x)))
              }}
              onPointerUp={(e) => {
                const moved = drag.current?.moved
                drag.current = undefined
                if (!moved) return setDecor((list) => list.filter((_, j) => j !== i))
                const p = at(e)
                const [x, y] = snapToEdge(p.x, p.y, p.ratio)
                setDecor((list) => list.map((s, j) => (j === i ? { ...s, x, y } : s)))
              }}
            >
              {d.e}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {PALETTE.map((e) => (
          <button key={e} type="button" onClick={() => add(e)} className="size-11 rounded-lg border-2 border-ink/20 text-2xl" aria-label={`Add ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button className="btn flex-1 bg-sun" onClick={save}>
          💾 Save
        </button>
        <button className="btn bg-white" onClick={() => setDecor([])} disabled={!decor.length}>
          Clear
        </button>
        <button className="btn bg-white" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}
