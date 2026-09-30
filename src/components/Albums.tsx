import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  albumPhotos, albumStats, dayKey, db, deleteAlbum, diaryDate, FAVS, hiddenAlbums, matches, newId, pick, saveAlbum, searchPhotos, unlockedAlbums, useLive,
  type Album, type Photo,
} from '../lib/db.ts'
import { shareFile, toast } from '../lib/fx.ts'
import { decode, toJpeg } from '../lib/images.ts'
import { canLock, verify } from '../lib/lock.ts'
import { ingest, sortPending } from '../lib/sorter.ts'
import { LABELS } from '../lib/vocab.ts'
import { blobUrl, lastEmoji, Polaroid, SortNow, useAlbums, useBackToClose } from './ui.tsx'

/** Count + cover for the grid. A pinned cover wins while it's still in the album. */
async function stats(a: Album) {
  if (a.id === FAVS.id) {
    const favs = await albumPhotos(FAVS.id)
    return { count: favs.length, cover: favs[0] }
  }
  const { count, cover } = await albumStats(a.id)
  const pinned = a.cover ? await db.photos.get(a.cover) : undefined
  return { count, cover: pinned?.category === a.id ? pinned : cover }
}

export function Albums() {
  const { list } = useAlbums()
  const shelf = [FAVS, ...list]
  const all = useLive(() => Promise.all(shelf.map(stats)), [list])
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const found = useLive(() => (q ? searchPhotos(q) : undefined), [q])
  return (
    <>
      <h1 className="heading text-6xl">Albums</h1>
      <p className="mb-5 font-hand text-2xl">sorted by a robot with taste (and you)</p>
      <label className="mb-7 block">
        <span className="sr-only">Search all photos by tag or caption</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Search every photo: pizza, beach, 🐶…" className="field" />
      </label>

      {q ? (
        found && (found.length ? (
          <>
            <p className="mb-3 font-bold">
              {found.length} photo{found.length === 1 ? '' : 's'} match “{query.trim()}”
            </p>
            <div className="columns-2 gap-4">
              {found.map((p) => (
                <Polaroid key={p.id} photo={p} href={`#/photo/s:${encodeURIComponent(q)}/${p.id}`} />
              ))}
            </div>
          </>
        ) : (
          <p className="font-hand text-3xl leading-tight">Nothing matches “{query.trim()}”. Try a tag like food, beach or cat.</p>
        ))
      ) : (
      <div className="grid grid-cols-2 gap-x-4 gap-y-7">
        {all &&
          shelf.map((album, i) => {
            const { count, cover } = all[i] ?? { count: 0 }
            if ((album.id === 'unsorted' || album.id === FAVS.id) && !count) return null
            return (
              <a key={album.id} href={`#/album/${album.id}`} className="group relative block pt-4 transition-transform active:translate-1">
                {/* folder tab */}
                <span className="absolute top-0 left-3 h-6 w-20 rounded-t-lg border-3 border-b-0 border-ink" style={{ background: album.color }} />
                <div className="card relative flex h-full flex-col rounded-tl-none p-3 group-active:shadow-none" style={{ background: album.color }}>
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-lg border-3 border-ink bg-white">
                    {album.locked ? (
                      <span className="text-5xl" aria-label="Private">
                        🔒
                      </span>
                    ) : cover ? (
                      <img src={blobUrl(cover, 'thumb')} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="text-5xl" aria-hidden>
                        {album.emoji}
                      </span>
                    )}
                  </div>
                  <h2 className="heading mt-3 text-2xl break-words">
                    {album.name} {album.emoji}
                  </h2>
                  <p className="text-sm font-bold">
                    {count} photo{count === 1 ? '' : 's'}
                  </p>
                </div>
              </a>
            )
          })}
        <button
          onClick={() => setEditing(true)}
          className="mt-4 grid min-h-48 place-items-center rounded-[18px] border-3 border-dashed border-ink bg-white/60 p-3 text-center font-bold transition-transform active:translate-1"
        >
          <span>
            <span className="heading block text-5xl">+</span>
            New album
          </span>
        </button>
      </div>
      )}
      {editing && <AlbumEditor onClose={() => setEditing(false)} />}
    </>
  )
}

const YOUR_EMPTY = ['Nothing in here yet. Add some photos!', 'Empty for now. Fill me up!', 'A fresh page, waiting for its first photo.']

export function AlbumView({ id }: { id: string }) {
  const favs = id === FAVS.id
  const albums = useAlbums()
  const album = favs ? FAVS : albums.get(id)
  const [open, setOpen] = useState(() => !album.locked || unlockedAlbums.has(id))
  const photos = useLive(() => (open ? albumPhotos(id) : Promise.resolve([])), [id, open])
  const [query, setQuery] = useState('')
  const [empty] = useState(() => pick(album.empty ?? YOUR_EMPTY))
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<string[]>() // set = picking photos for a booth strip
  const picker = useRef<HTMLInputElement>(null)
  const q = query.trim().toLowerCase()
  const shown = photos?.filter((p) => matches(p, q)) ?? []

  // Newest first, grouped under diary-style day headers.
  const days = new Map<string, Photo[]>()
  for (const p of shown) days.set(p.day, [...(days.get(p.day) ?? []), p])

  async function unlock() {
    if (!(await verify())) return toast("That didn't unlock it 🔒")
    unlockedAlbums.add(id)
    hiddenAlbums.delete(id)
    setOpen(true)
  }

  async function add(files: File[]) {
    setAdding(true)
    let added = 0
    for (const file of files) {
      try {
        await ingest(file, id)
        added++
      } catch (e) {
        toast(`Couldn't add ${file.name || 'a photo'} 😵 ${(e as Error).message}`)
      }
    }
    setAdding(false)
    if (added) toast(`Added ${added} photo${added > 1 ? 's' : ''} to ${album.name} ${album.emoji}`)
    void sortPending() // writes their captions; the album stays yours
  }

  async function run(job: () => Promise<unknown>) {
    setBusy(true)
    try {
      await job()
    } catch (e) {
      toast(`😵 ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const share = () =>
    run(async () => {
      const { exportBackup } = await import('../lib/backup.ts')
      const name = album.name.replace(/[^\w -]+/g, '').trim() || 'album'
      await shareFile(await exportBackup(favs ? { photos: photos ?? [] } : { album }), `scrappy-${name}.zip`, `My “${album.name}” album from Scrappy. Open Scrappy → Settings → Import to add it.`)
    })

  const strip = () =>
    run(async () => {
      const chosen = picked!.map((pid) => photos!.find((p) => p.id === pid)!)
      await shareFile(await renderStrip(chosen), `scrappy-strip-${dayKey()}.jpg`)
      setPicked(undefined)
    })

  const toggle = (pid: string) =>
    setPicked((list = []) => (list.includes(pid) ? list.filter((x) => x !== pid) : list.length < 4 ? [...list, pid] : (toast('4 photos max, like a real booth 📸'), list)))

  if (!open)
    return (
      <div className="card mt-10 space-y-4 p-6 text-center" style={{ background: album.color }}>
        <p className="text-7xl" aria-hidden>
          🔒
        </p>
        <h1 className="heading text-5xl break-words">
          {album.name} {album.emoji}
        </h1>
        <p className="font-bold">This album is private.</p>
        <div className="flex justify-center gap-3">
          <a href="#/albums" onClick={(e) => (e.preventDefault(), history.back())} className="btn bg-white">
            ← Back
          </a>
          <button className="btn bg-sun" onClick={unlock}>
            🔓 Unlock
          </button>
        </div>
      </div>
    )

  return (
    <>
      <header className="card relative mb-5 p-4" style={{ background: album.color }}>
        <div className="mb-3 flex flex-wrap gap-2">
          <a href="#/albums" onClick={(e) => (e.preventDefault(), history.back())} className="btn bg-white text-lg" aria-label="Back to albums">
            ←
          </a>
          {!favs && (
            <button className="btn ml-auto bg-white" onClick={() => setEditing(true)}>
              ✏️ Edit
            </button>
          )}
          {!favs && id !== 'unsorted' && (
            <button className="btn bg-white" onClick={() => picker.current?.click()} disabled={adding}>
              {adding ? 'Adding…' : '➕ Add'}
            </button>
          )}
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) void add(files)
            }}
          />
        </div>
        <h1 className="heading text-5xl break-words">
          {album.name} {album.emoji}
        </h1>
        <p className="font-bold">
          {photos?.length ?? 0} photo{photos?.length === 1 ? '' : 's'}
          {!!album.keywords?.length && ` · auto-adds ${album.keywords.join(', ')}`}
        </p>
        {id === 'unsorted' && !!photos?.length && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm font-bold">Waiting for the AI. Sort now, or tap one and pick its album yourself.</p>
            <SortNow />
          </div>
        )}
        {!!photos?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn bg-white" onClick={() => setPicked(picked ? undefined : [])} aria-pressed={!!picked}>
              🎞️ {picked ? 'Cancel strip' : 'Booth strip'}
            </button>
            <button className="btn bg-white" onClick={share} disabled={busy}>
              {busy && !picked ? 'Zipping…' : '👯 Share album'}
            </button>
          </div>
        )}
      </header>

      {picked && (
        <div className="card rise sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 mb-5 flex items-center justify-between gap-3 bg-sun p-3">
          <p className="font-bold">Pick 2–4 photos · {picked.length} picked</p>
          <button className="btn shrink-0 bg-pink" onClick={strip} disabled={picked.length < 2 || busy}>
            {busy ? 'Printing…' : '📸 Make strip'}
          </button>
        </div>
      )}

      {!!photos?.length && !picked && (
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
              <Polaroid key={p.id} photo={p} href={`#/photo/c:${id}/${p.id}`} onPick={picked && (() => toggle(p.id))} picked={picked?.includes(p.id)} />
            ))}
          </div>
        </section>
      ))}

      {photos && !shown.length && <p className="mt-6 font-hand text-3xl leading-tight">{q ? `Nothing matches “${query.trim()}”.` : empty}</p>}
      {editing && <AlbumEditor album={album} onClose={() => setEditing(false)} />}
    </>
  )
}

/** A classic vertical photo-booth strip: 2–4 frames, black border, date at the bottom. */
async function renderStrip(photos: Photo[]) {
  await document.fonts.load('60px Bangers')
  const W = 600
  const P = 36
  const fw = W - P * 2
  const fh = Math.round((fw * 3) / 4)
  const H = P + photos.length * (fh + P) + 90
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#111'
  g.fillRect(0, 0, W, H)
  const images = await Promise.all(photos.map((p) => decode(p.full)))
  images.forEach((im, i) => {
    const y = P + i * (fh + P)
    const s = Math.max(fw / im.naturalWidth, fh / im.naturalHeight) // cover-crop to 4:3
    const sw = fw / s
    const sh = fh / s
    g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, P, y, fw, fh)
  })
  g.fillStyle = '#FFF6E5'
  g.font = '52px Bangers'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(`SCRAPPY · ${diaryDate(dayKey()).toUpperCase()}`, W / 2, H - 55)
  return toJpeg(c, 0.9)
}

// Every colour keeps black text readable (≥ 4.5:1).
const COLORS: [string, string][] = [
  ['#FF4FA3', 'hot pink'], ['#FF5A36', 'tomato'], ['#FF9F1C', 'orange'], ['#FFD23F', 'sunny yellow'],
  ['#8AC926', 'lime'], ['#2EC4B6', 'mint'], ['#00BBF9', 'sky blue'], ['#3A86FF', 'electric blue'],
  ['#9B5DE5', 'purple'], ['#F15BB5', 'bubblegum'], ['#C9ADA7', 'sand'], ['#FFFFFF', 'white'],
]
const QUICK_EMOJI = ['📸', '🐶', '🐱', '☕', '🍕', '🎉', '✈️', '🏖️', '💪', '📚', '🎮', '🌸', '🎨', '🚗', '👶', '❤️']
const LABEL_NAMES = [...new Set(LABELS.flatMap((l) => (l.name ? [l.name] : [])))].sort()

/** Create or restyle an album. Your own albums can also auto-add photos by keyword, and be deleted. */
function AlbumEditor({ album, onClose }: { album?: Album; onClose: () => void }) {
  const close = useBackToClose(onClose)
  const [a, setA] = useState<Album>(
    () => album ?? { id: newId(), name: '', emoji: '📸', color: '#9B5DE5', burst: 'YAY!', keywords: [], createdAt: Date.now() },
  )
  const [word, setWord] = useState('')
  const [confirming, setConfirming] = useState(false)
  const count = useLive(() => albumStats(a.id).then((s) => s.count), [a.id])
  const set = (patch: Partial<Album>) => setA((x) => ({ ...x, ...patch }))
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!album) nameInput.current?.focus({ preventScroll: true }) // autoFocus would scroll the sheet mid-slide and clip its top
  }, [album])
  const yours = !a.builtin
  const [lockable, setLockable] = useState(false)
  useEffect(() => void canLock().then(setLockable), [])

  // Turning privacy on or off both need your face or finger, so nobody else can flip it.
  async function toggleLock() {
    if (!(await verify())) return toast("Couldn't confirm it's you 🔒")
    if (!a.locked) unlockedAlbums.add(a.id) // you just proved it's you: stay unlocked this session
    set({ locked: !a.locked })
  }

  function addWord() {
    const w = word.trim().toLowerCase()
    if (w && !a.keywords?.includes(w)) set({ keywords: [...(a.keywords ?? []), w] })
    setWord('')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const name = a.name.trim()
    if (!name) return
    await saveAlbum({ ...a, name, emoji: a.emoji || '📁', burst: a.burst.trim().toUpperCase() || 'YAY!' })
    toast(album ? 'Album updated ✓' : `Made “${name}” ${a.emoji}`)
    close()
  }

  async function remove() {
    await deleteAlbum(a.id)
    toast(`Deleted “${a.name}”`)
    close()
  }

  async function reset() {
    await db.albums.delete(a.id) // built-ins fall back to their original look
    toast('Back to the original look ✓')
    close()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60" onClick={close}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="card rise max-h-[92svh] w-full max-w-lg space-y-4 overflow-y-auto rounded-b-none bg-paper p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        role="dialog"
        aria-modal="true"
        aria-label={album ? 'Edit album' : 'New album'}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="heading text-4xl">{album ? 'Edit album' : 'New album'}</h2>
          <p className="card w-fit max-w-[55%] truncate px-3 py-1 font-bold" style={{ background: a.color }}>
            {a.emoji} {a.name || 'Your album'}
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block font-bold">Name</span>
          <input ref={nameInput} value={a.name} onChange={(e) => set({ name: e.target.value })} maxLength={30} required className="field" placeholder="e.g. Pets" />
        </label>

        <div>
          <label className="mb-1 flex items-center gap-3 font-bold">
            Emoji
            <input value={a.emoji} onChange={(e) => set({ emoji: lastEmoji(e.target.value) })} className="field w-16 text-center text-2xl" aria-label="Emoji" />
            <span className="text-sm font-normal">type any, or pick:</span>
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_EMOJI.map((e) => (
              <button key={e} type="button" onClick={() => set({ emoji: e })} className={`size-11 rounded-lg border-2 text-2xl ${a.emoji === e ? 'border-ink bg-white' : 'border-transparent'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 font-bold">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(([hex, label]) => (
              <label key={hex} className="cursor-pointer" title={label}>
                <input type="radio" name="color" value={hex} checked={a.color === hex} onChange={() => set({ color: hex })} className="peer sr-only" aria-label={label} />
                <span
                  className="block size-11 rounded-full border-3 border-ink peer-checked:shadow-hard peer-checked:ring-4 peer-checked:ring-ink/25 peer-focus-visible:outline-3 peer-focus-visible:outline-dashed peer-focus-visible:outline-blue"
                  style={{ background: hex }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block font-bold">Burst word (pops up when a photo lands here)</span>
          <input value={a.burst} onChange={(e) => set({ burst: e.target.value })} maxLength={10} className="field heading text-xl" placeholder="YAY!" />
        </label>

        {yours && (
          <div>
            <span className="mb-1 block font-bold">Auto-add photos of…</span>
            <p className="mb-2 text-sm">New photos tagged with any of these land here automatically. Leave empty to only add photos yourself.</p>
            <div className="flex gap-2">
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addWord())}
                list="scrappy-labels"
                className="field min-w-0 flex-1"
                placeholder="e.g. cat, coffee, beach"
                aria-label="Keyword"
              />
              <button type="button" className="btn bg-white" onClick={addWord}>
                Add
              </button>
            </div>
            <datalist id="scrappy-labels">
              {LABEL_NAMES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {!!a.keywords?.length && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Keywords">
                {a.keywords.map((k) => (
                  <li key={k}>
                    <button
                      type="button"
                      onClick={() => set({ keywords: a.keywords!.filter((x) => x !== k) })}
                      className="rounded-full border-2 border-ink bg-white px-3 py-1 text-sm font-bold"
                      aria-label={`Remove ${k}`}
                    >
                      {k} ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {lockable && a.id !== 'unsorted' && (
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={!!a.locked} onChange={toggleLock} className="size-6 accent-ink" />
            🔒 Private: needs Face ID or fingerprint to open, and hides its photos everywhere else
          </label>
        )}

        <div className="flex gap-3 pt-1">
          <button className="btn flex-1 bg-sun">💾 Save</button>
          <button type="button" className="btn bg-white" onClick={close}>
            Cancel
          </button>
        </div>

        {album && yours && !confirming && (
          <button type="button" className="btn w-full bg-tomato" onClick={() => setConfirming(true)}>
            🗑️ Delete album
          </button>
        )}
        {confirming && (
          <div className="card space-y-3 bg-white p-4" role="alertdialog" aria-label="Confirm delete">
            <p className="font-bold">
              Delete “{a.name}”?{' '}
              {count ? `Its ${count} photo${count > 1 ? 's go' : ' goes'} back to the album the AI picked.` : 'It has no photos.'}
            </p>
            <div className="flex gap-3">
              <button type="button" className="btn bg-tomato" onClick={remove}>
                Yes, delete
              </button>
              <button type="button" className="btn bg-white" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </div>
          </div>
        )}
        {album?.builtin && (
          <button type="button" className="btn w-full bg-white" onClick={reset}>
            ↩️ Reset to original
          </button>
        )}
      </form>
    </div>
  )
}
