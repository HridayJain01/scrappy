import { useState } from 'react'
import { ALBUMS, CATEGORIES, albumPhotos, albumStats, diaryDate, pick, useLive, type AlbumId, type Photo } from '../lib/db.ts'
import { blobUrl, Polaroid, SortNow } from './ui.tsx'

const ALL: AlbumId[] = [...CATEGORIES, 'unsorted']

export function Albums() {
  const stats = useLive(() => Promise.all(ALL.map(async (id) => ({ id, ...(await albumStats(id)) }))))
  return (
    <>
      <h1 className="heading text-6xl">Albums</h1>
      <p className="mb-6 font-hand text-2xl">sorted by a robot with taste</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-7">
        {stats
          ?.filter((s) => s.id !== 'unsorted' || s.count)
          .map(({ id, count, cover }) => {
            const album = ALBUMS[id]
            return (
              <a key={id} href={`#/album/${id}`} className="group relative block pt-4 transition-transform active:translate-1">
                {/* folder tab */}
                <span className="absolute top-0 left-3 h-6 w-20 rounded-t-lg border-3 border-b-0 border-ink" style={{ background: album.color }} />
                <div className="card relative flex h-full flex-col rounded-tl-none p-3 group-active:shadow-none" style={{ background: album.color }}>
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-lg border-3 border-ink bg-white">
                    {cover ? (
                      <img src={blobUrl(cover, 'thumb')} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="text-5xl" aria-hidden>
                        {album.emoji}
                      </span>
                    )}
                  </div>
                  <h2 className="heading mt-3 text-2xl">
                    {album.name} {album.emoji}
                  </h2>
                  <p className="text-sm font-bold">
                    {count} photo{count === 1 ? '' : 's'}
                  </p>
                </div>
              </a>
            )
          })}
      </div>
    </>
  )
}

const matches = (p: Photo, q: string) =>
  !q || p.tags?.some((t) => t.includes(q)) || p.caption?.toLowerCase().includes(q) || p.title?.toLowerCase().includes(q)

export function AlbumView({ id }: { id: AlbumId }) {
  const album = ALBUMS[id]
  const photos = useLive(() => albumPhotos(id), [id])
  const [query, setQuery] = useState('')
  const [empty] = useState(() => pick(album.empty))
  const q = query.trim().toLowerCase()
  const shown = photos?.filter((p) => matches(p, q)) ?? []

  // Newest first, grouped under diary-style day headers.
  const days = new Map<string, Photo[]>()
  for (const p of shown) days.set(p.day, [...(days.get(p.day) ?? []), p])

  return (
    <>
      <header className="card relative mb-5 p-4" style={{ background: album.color }}>
        <a href="#/albums" onClick={(e) => (e.preventDefault(), history.back())} className="btn mb-3 bg-white text-lg" aria-label="Back to albums">
          ←
        </a>
        <h1 className="heading text-5xl">
          {album.name} {album.emoji}
        </h1>
        <p className="font-bold">
          {photos?.length ?? 0} photo{photos?.length === 1 ? '' : 's'}
        </p>
        {id === 'unsorted' && !!photos?.length && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm font-bold">Waiting for the AI. Sort now, or tap one and pick its album yourself.</p>
            <SortNow />
          </div>
        )}
      </header>

      {!!photos?.length && (
        <label className="mb-6 block">
          <span className="sr-only">Search by tag or caption</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Search tags or captions" className="field" />
        </label>
      )}

      {[...days].map(([day, list]) => (
        <section key={day} className="mb-4">
          <h2 className="mb-4 font-hand text-3xl font-bold">{diaryDate(day)}</h2>
          <div className="columns-2 gap-4">
            {list.map((p) => (
              <Polaroid key={p.id} photo={p} href={`#/photo/c:${id}/${p.id}`} />
            ))}
          </div>
        </section>
      ))}

      {photos && !shown.length && <p className="mt-6 font-hand text-3xl leading-tight">{q ? `Nothing matches “${query.trim()}”.` : empty}</p>}
    </>
  )
}
