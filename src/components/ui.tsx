import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { modelProgress } from '../lib/clip.ts'
import { tilt, type Album, type Photo } from '../lib/db.ts'
import { toast } from '../lib/fx.ts'
import { sortPending } from '../lib/sorter.ts'

/** All albums (built-ins with your edits + your own), provided by App once loaded. */
export const AlbumsContext = createContext<Album[]>([])
export function useAlbums() {
  const list = useContext(AlbumsContext)
  return useMemo(() => {
    const byId = new Map(list.map((a) => [a.id, a]))
    // A photo whose album vanished (shouldn't happen, deleteAlbum moves them) still renders, as Unsorted.
    return { list, get: (id: string) => byId.get(id) ?? byId.get('unsorted')! }
  }, [list])
}

/** Keeps only the last character typed (emoji-aware), so typing a new emoji replaces the old one. */
export const lastEmoji = (s: string) => [...new Intl.Segmenter().segment(s.trim())].at(-1)?.segment ?? ''

/** Lets the phone's back button close a sheet instead of leaving the page. Call close() through the returned function. */
export function useBackToClose(onClose: () => void) {
  useEffect(() => {
    history.pushState({ sheet: true }, '')
    addEventListener('popstate', onClose)
    return () => removeEventListener('popstate', onClose)
  }, [])
  return () => history.back()
}

// Stored blobs never change, so one object URL per photo+size lives for the whole session.
const urls = new Map<string, string>()
export function blobUrl(photo: Photo, size: 'thumb' | 'full') {
  const key = photo.id + size
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(photo[size]))
  return urls.get(key)!
}
export function forgetUrls(id: string) {
  for (const size of ['thumb', 'full']) {
    const url = urls.get(id + size)
    if (url) URL.revokeObjectURL(url)
    urls.delete(id + size)
  }
}

export function Polaroid({ photo, href, small }: { photo: Photo; href: string; small?: boolean }) {
  const pending = photo.status === 'pending'
  const album = useAlbums().get(photo.category)
  return (
    // The wrapper's top padding holds the tape's overhang, so a masonry column break can't split it off.
    <div className="break-inside-avoid pt-3.5 pb-2">
      <a href={href} className="polaroid" style={{ rotate: `${tilt(photo.id)}deg` }}>
        <span className="tape" style={{ background: album.color }} aria-hidden />
        <img
          src={blobUrl(photo, 'thumb')}
          alt={photo.title || photo.caption || 'Photo'}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="block w-full bg-neutral-200"
          style={{ aspectRatio: photo.ratio }}
        />
        {small ? (
          <span className="block h-5" />
        ) : (
          <span className="my-1.5 line-clamp-2 min-h-[2.2em] pr-8 pl-0.5 font-hand text-[1.3rem] leading-[1.1]">
            {photo.caption || (pending ? 'waiting to be sorted…' : '')}
          </span>
        )}
        {photo.sticker && (
          <span className={`absolute right-1.5 bottom-1 ${small ? 'text-base' : 'text-2xl'}`} aria-hidden>
            {photo.sticker}
          </span>
        )}
      </a>
    </div>
  )
}

/** When you deploy a new version, installed apps show this until tapped. Updating mid-session could break a photo in progress. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Installed apps can sit open for days: look for a new version whenever the app comes back to the front.
      if (reg) addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update())
    },
  })
  if (!needRefresh) return null
  return (
    <div className="card rise mb-5 flex items-center justify-between gap-3 bg-blue p-3" role="status">
      <p className="font-bold">✨ Scrappy got an update! Your photos stay put.</p>
      <button
        className="btn shrink-0 bg-white"
        onClick={() => {
          // Reload as soon as the new version takes over (covers a first session that was never controlled, too).
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload())
          void updateServiceWorker(false)
        }}
      >
        Update
      </button>
    </div>
  )
}

/** On-device model download progress, 0…1 (1 = loaded and ready). */
export function useModelProgress() {
  const [progress, setProgress] = useState(modelProgress)
  useEffect(() => {
    const update = () => setProgress(modelProgress())
    addEventListener('ai-progress', update)
    return () => removeEventListener('ai-progress', update)
  }, [])
  return progress
}

// A 12-spike comic burst, slightly uneven so it looks hand-inked.
const STAR = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2
  const r = i % 2 ? 33 : 50 - (i % 4) * 2.5
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`
}).join(' ')

export function Burst({ text, color, className = '' }: { text: string; color: string; className?: string }) {
  return (
    <div className={`relative grid aspect-square place-items-center ${className}`} aria-hidden>
      <svg viewBox="-4 -4 108 108" className="absolute inset-0 size-full">
        <polygon points={STAR} fill={color} stroke="#111" strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <span className="heading relative -rotate-8 text-[2.1rem] [text-shadow:2px_2px_0_#fff]">{text}</span>
    </div>
  )
}

export function SortNow() {
  const [busy, setBusy] = useState(false)
  async function run() {
    if (!navigator.onLine) return toast("You're offline. I'll sort these when you're back 📡")
    setBusy(true)
    await sortPending()
    setBusy(false)
  }
  return (
    <button className="btn shrink-0 bg-sun" onClick={run} disabled={busy}>
      {busy ? 'Sorting…' : '✨ Sort now'}
    </button>
  )
}

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; n: number }>()
  useEffect(() => {
    let timer = 0
    const show = (e: Event) => {
      setMsg((m) => ({ text: (e as CustomEvent<string>).detail, n: (m?.n ?? 0) + 1 }))
      clearTimeout(timer)
      timer = window.setTimeout(() => setMsg(undefined), 4000)
    }
    addEventListener('toast', show)
    return () => removeEventListener('toast', show)
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[90] flex justify-center" role="status" aria-live="polite">
      {msg && (
        <p key={msg.n} className="card rise max-w-sm bg-sun px-4 py-3 text-center font-bold">
          {msg.text}
        </p>
      )}
    </div>
  )
}

const TABS = [
  ['', '📸', 'Today'],
  ['albums', '📒', 'Albums'],
  ['recap', '🗓️', 'Recap'],
  ['settings', '⚙️', 'Settings'],
]

export function TabBar({ current }: { current: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-3 border-ink bg-paper pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-2 px-3 py-2">
        {TABS.map(([page, icon, label]) => (
          <li key={page}>
            <a
              href={`#/${page}`}
              aria-current={current === page ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-3 text-xs font-bold ${current === page ? 'border-ink bg-sun shadow-hard' : 'border-transparent'}`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {icon}
              </span>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
