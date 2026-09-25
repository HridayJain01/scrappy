import { useState, type FormEvent } from 'react'
import { getSetting, setSetting } from '../lib/db.ts'
import { DEFAULT_MODEL, testKey } from '../lib/gemini.ts'
import { Burst } from './ui.tsx'

export function Onboarding() {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function start(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await testKey(key.trim(), await getSetting('model', DEFAULT_MODEL))
      await setSetting('apiKey', key.trim()) // App notices and swaps this screen out
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-lg px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-12">
      <div className="flex items-center gap-2">
        <h1 className="heading -rotate-3 text-7xl">Scrappy</h1>
        <Burst text="HI!" color="#FF4FA3" className="pop w-24 shrink-0" />
      </div>
      <p className="mt-2 font-hand text-3xl leading-tight">Snap it. I'll sort it. A scrapbook that files itself.</p>

      <form onSubmit={start} className="card relative mt-8 space-y-5 bg-white p-5 pt-7">
        <span className="tape bg-mint" aria-hidden />
        <div>
          <h2 className="heading text-2xl">① Grab a free Gemini key</h2>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="btn mt-2 bg-blue">
            Open Google AI Studio ↗
          </a>
        </div>
        <label className="block">
          <span className="heading block text-2xl">② Paste it here</span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
            required
            className="field mt-2"
          />
        </label>
        {error && <p className="rounded-lg border-2 border-ink bg-tomato p-2 font-bold">❌ {error}</p>}
        <button className="btn w-full bg-sun text-xl" disabled={busy || !key.trim()}>
          {busy ? 'Checking…' : "③ Let's go! 🚀"}
        </button>
      </form>

      <p className="mt-6 text-sm leading-relaxed">
        🔒 Your key and photos stay on this device. There's no account and no server. To sort a photo, a small 768px copy is sent to Google
        Gemini. On the free tier, Google may use what you send to improve its products.
      </p>
    </main>
  )
}
