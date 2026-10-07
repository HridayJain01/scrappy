import { useEffect, useState } from 'react'
import { getSetting, setSetting, useLive } from '../lib/db.ts'

const STEPS: [selector: string, text: string][] = [
  ['.shutter', 'Tap SNAP! to take a photo. Scrappy files it into the right album for you.'],
  ['[data-tour="gallery"]', 'Already have photos? Add them from your gallery here.'],
  ['[data-tour="shuffle"]', 'Shuffle brings back a random memory.'],
  ['a[href="#/albums"]', 'Albums: everything sorted, plus favourites and private albums.'],
  ['a[href="#/recap"]', 'Recap: look back over your month.'],
  ['a[href="#/settings"]', 'Settings: backups, AI options and more. That’s it, have fun!'],
]

// First-run spotlight tour. Shows once, then sets 'toured'.
export function Tour() {
  const toured = useLive(() => getSetting('toured', false))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect>()

  useEffect(() => {
    if (toured !== false) return
    const el = document.querySelector(STEPS[i][0])
    el?.scrollIntoView({ block: 'center' })
    const update = () => setRect(el?.getBoundingClientRect())
    update()
    addEventListener('resize', update)
    addEventListener('scroll', update)
    return () => (removeEventListener('resize', update), removeEventListener('scroll', update))
  }, [i, toured])

  if (toured !== false || !rect) return null
  const done = () => void setSetting('toured', true)
  const last = i === STEPS.length - 1
  const below = rect.top < innerHeight / 2

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="App tour">
      {/* the giant shadow blanks everything except the highlighted element */}
      <div
        className="pointer-events-none fixed rounded-2xl border-3 border-sun transition-all duration-300"
        style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgb(17 17 17 / 0.75)' }}
      />
      <div
        className="fixed inset-x-4 mx-auto max-w-sm rounded-2xl border-3 border-ink bg-paper p-4 shadow-hard"
        style={below ? { top: rect.bottom + 18 } : { bottom: innerHeight - rect.top + 18 }}
      >
        <p className="font-bold">{STEPS[i][1]}</p>
        <div className="mt-3 flex items-center justify-between">
          <button className="text-sm underline" onClick={done}>Skip</button>
          <span className="text-xs">{i + 1}/{STEPS.length}</span>
          <button className="btn bg-sun" onClick={() => (last ? done() : setI(i + 1))}>{last ? 'Got it' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
