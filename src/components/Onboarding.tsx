import { warmUp } from '../lib/clip.ts'
import { setSetting } from '../lib/db.ts'
import { Burst } from './ui.tsx'

// Only iOS Safari defines navigator.standalone (false in a browser tab, true when opened from the Home Screen).
const iosTab = (navigator as Navigator & { standalone?: boolean }).standalone === false

export function Onboarding() {
  function start() {
    void warmUp() // start the one-time model download now, so the first photo sorts fast
    void setSetting('onboarded', true) // App notices and swaps this screen out
  }

  return (
    <main className="mx-auto max-w-lg px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-12">
      <div className="flex items-center gap-2">
        <h1 className="heading -rotate-3 text-7xl">Scrappy</h1>
        <Burst text="HI!" color="#FF4FA3" className="pop w-24 shrink-0" />
      </div>
      <p className="mt-2 font-hand text-3xl leading-tight">Snap it. I'll sort it. A scrapbook that files itself.</p>

      <section className="card relative mt-8 space-y-4 bg-white p-5 pt-7">
        <span className="tape bg-mint" aria-hidden />
        <ul className="space-y-3 font-bold">
          <li>📸 Snap a photo, or pick a bunch from your gallery.</li>
          <li>🧠 A little AI that lives on your phone sorts each one into an album and writes its caption.</li>
          <li>🔒 No account, no key, no cloud. Your photos never leave this phone.</li>
        </ul>
        {iosTab && (
          <p className="rounded-lg border-2 border-ink bg-sun p-3 text-sm font-bold">
            📲 On iPhone, add Scrappy to your Home Screen first (Share → Add to Home Screen) and open it from there. Safari and the installed app
            keep separate photo storage.
          </p>
        )}
        <button className="btn w-full bg-sun text-xl" onClick={start}>
          Let's go! 🚀
        </button>
        <p className="text-sm">First time only: I download my sorting brain (about 70 MB), so Wi-Fi is a good idea.</p>
      </section>

      <p className="mt-6 text-sm leading-relaxed">Got a Google Gemini API key? Add it later in Settings for extra-witty captions.</p>
    </main>
  )
}
