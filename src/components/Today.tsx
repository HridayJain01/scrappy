import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { dayKey, dayPhotos, db, flashbackDays, getSetting, pendingCount, setSetting, streakNow, useLive, type Photo } from '../lib/db.ts'
import { confetti, flash, reducedMotion, shutterSound, sleep, toast, unlockAudio } from '../lib/fx.ts'
import { ingest, sortPhoto } from '../lib/sorter.ts'
import { Booth, type BoothStage } from './Booth.tsx'
import { Polaroid, SortNow } from './ui.tsx'

export function Today() {
  const today = dayKey()
  const photos = useLive(() => dayPhotos(today), [today])
  const streak = useLive(streakNow)
  const pending = useLive(pendingCount)
  const flashbacks = useLive(() => Promise.all(flashbackDays(today).map(async (f) => ({ ...f, photos: await dayPhotos(f.day) }))), [today])
  const [stage, setStage] = useState<BoothStage>()
  const [busy, setBusy] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  // Confetti when the streak goes up (checked once the booth is done, so it lands after the show).
  useEffect(() => {
    if (streak === undefined || busy) return
    // One transaction, so two quick runs can't both see the old value and double the confetti.
    db.transaction('rw', db.settings, async () => {
      const last = await getSetting('streak', 0)
      if (streak !== last) await setSetting('streak', streak)
      return streak > last
    }).then((up) => up && confetti())
  }, [streak, busy])

  function open(input: HTMLInputElement | null) {
    unlockAudio() // must happen inside the tap for iOS
    input?.click()
  }

  async function snap(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = '' // let the same file be picked again
    if (!files.length || busy) return
    setBusy(true)
    const motion = !reducedMotion()
    for (const [i, file] of files.entries()) {
      const n = { n: i + 1, total: files.length }
      flash()
      shutterSound()
      setStage({ ...n, ratio: 3 / 4, phase: 'developing' }) // grey polaroid right away, while the photo is processed
      let photo: Photo
      try {
        photo = await ingest(file)
      } catch (err) {
        toast(`Couldn't save that one 😵 ${(err as Error).message}`)
        continue
      }
      const url = URL.createObjectURL(photo.full)
      const base = { ...n, url, ratio: photo.ratio }
      setStage({ ...base, phase: 'developing' })
      const [sorted] = await Promise.all([
        sortPhoto(photo.id).catch((err: Error) => void toast(`Gemini hiccup: ${err.message} Saved to Unsorted 📦`)),
        sleep(motion ? 2000 : 300),
      ])
      if (!navigator.onLine) toast("You're offline, so it's in Unsorted 📦 I'll sort it when you're back.")
      setStage({ ...base, phase: 'reveal', photo: sorted ?? undefined })
      await sleep(motion ? 1900 : 1500)
      if (motion) {
        setStage({ ...base, phase: 'fly', photo: sorted ?? undefined })
        await sleep(650)
      }
      URL.revokeObjectURL(url)
    }
    setStage(undefined)
    setBusy(false)
  }

  const memories = flashbacks?.filter((f) => f.photos.length)
  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="heading w-fit -rotate-2 rounded-md border-3 border-ink bg-sun px-2 pt-1 text-lg">Today</p>
          <h1 className="mt-1 font-hand text-5xl leading-none font-bold">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
        </div>
        {streak !== undefined && (
          <p className="card shrink-0 rotate-3 bg-white px-3 py-2 text-center font-bold" aria-label={`${streak}-day streak`}>
            🔥 {streak ? `${streak}-day streak` : 'start a streak!'}
          </p>
        )}
      </header>

      <section className="my-8 flex flex-col items-center gap-5">
        <button className="shutter" onClick={() => open(camera.current)} disabled={busy} aria-label="Take a photo">
          <span className="heading text-5xl text-white [-webkit-text-stroke:2px_#111] [text-shadow:3px_3px_0_#111]">SNAP!</span>
        </button>
        <button className="btn bg-white" onClick={() => open(gallery.current)} disabled={busy}>
          🖼️ From gallery
        </button>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={snap} />
        <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={snap} />
      </section>

      {!!pending && (
        <section className="card mb-6 flex items-center justify-between gap-3 bg-sun/40 p-3">
          <p className="font-bold">
            📦 {pending} waiting to be sorted
          </p>
          <SortNow />
        </section>
      )}

      {!!memories?.length && (
        <section className="card relative mb-8 -rotate-1 bg-white p-4 pt-5">
          <span className="tape bg-blue" aria-hidden />
          <h2 className="heading text-3xl">📅 On this day</h2>
          {memories.map((m) => (
            <div key={m.day} className="mt-2">
              <p className="font-hand text-2xl">{m.label}</p>
              <div className="mt-3 grid grid-cols-3 items-start gap-3">
                {m.photos.slice(0, 3).map((p) => (
                  <Polaroid key={p.id} photo={p} href={`#/photo/d:${m.day}/${p.id}`} small />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <h2 className="heading mb-5 text-3xl">Today's page</h2>
      {photos?.length ? (
        <div className="columns-2 gap-4">
          {photos.map((p) => (
            <Polaroid key={p.id} photo={p} href={`#/photo/d:${today}/${p.id}`} />
          ))}
        </div>
      ) : (
        photos && <p className="font-hand text-3xl leading-tight">Nothing on today's page yet. That shutter's looking lonely.</p>
      )}

      {stage && <Booth stage={stage} />}
    </>
  )
}
