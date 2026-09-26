import type { Photo } from '../lib/db.ts'
import { Burst, useAlbums, useModelProgress } from './ui.tsx'

export interface BoothStage {
  url?: string // unset while the photo is still being processed: the polaroid stays grey, like real instant film
  ratio: number
  n: number
  total: number
  phase: 'developing' | 'reveal' | 'fly'
  photo?: Photo // set once sorted; undefined on reveal = saved to Unsorted for later
}

/** The photo-booth moment: a polaroid develops, wobbles, gets its comic burst, then flies to its album. */
export function Booth({ stage }: { stage: BoothStage }) {
  const { phase, photo } = stage
  const album = useAlbums().get(photo?.category ?? 'unsorted')
  const developing = phase === 'developing'
  const download = useModelProgress()
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-ink/80 p-6" role="status" aria-live="polite">
      {stage.total > 1 && (
        <span className="card absolute top-[calc(env(safe-area-inset-top)+1rem)] bg-white px-3 py-1 font-bold">
          {stage.n} / {stage.total}
        </span>
      )}
      <div key={stage.n} className={phase === 'fly' ? 'fly' : ''} style={{ width: `min(80vw, 340px, ${Math.round(46 * stage.ratio)}vh)` }}>
        <div className={developing ? 'pop' : 'wobble'}>
          {/* The burst pops out above the frame, never over the photo. */}
          <div className="-mb-3 flex h-28 justify-end">
            {!developing && <Burst text={album.burst} color={album.color} className="pop relative z-10 -mr-6 w-32" />}
          </div>
          <figure className="relative border-3 border-ink bg-white p-3 pb-0 shadow-[6px_6px_0_#111]">
            <span className="tape" style={{ background: album.color }} aria-hidden />
            <div className="bg-[#8f8f8f]" style={{ aspectRatio: stage.ratio }}>
              {stage.url && <img src={stage.url} alt="" className="develop block size-full" />}
            </div>
            <figcaption className="relative min-h-24 py-2 pr-9">
              {developing ? (
                <span className="dots font-hand text-3xl">
                  {download > 0 && download < 1 ? `downloading my sorting brain ${Math.round(download * 100)}%` : 'developing'}
                </span>
              ) : photo ? (
                <>
                  <b className="heading block text-2xl">{photo.title}</b>
                  <span className="font-hand text-2xl leading-none">{photo.caption}</span>
                  <span className="absolute right-0 bottom-2 text-3xl">{photo.sticker}</span>
                </>
              ) : (
                <span className="font-hand text-2xl leading-none">Saved to Unsorted 📦 I'll sort it as soon as I can.</span>
              )}
            </figcaption>
          </figure>
          <p className={`card mx-auto mt-5 w-fit px-4 py-2 font-bold ${developing ? 'invisible' : 'rise'}`} style={{ background: album.color }}>
            → {album.name} {album.emoji}
          </p>
        </div>
      </div>
    </div>
  )
}
