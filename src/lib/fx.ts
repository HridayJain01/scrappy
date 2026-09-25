// Browser-side flourishes and small platform helpers.

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const toast = (message: string) => dispatchEvent(new CustomEvent('toast', { detail: message }))

let audio: AudioContext | undefined
/** Call inside a tap handler: iOS only lets audio start from a user gesture. */
export function unlockAudio() {
  audio ??= new AudioContext()
  audio.resume().catch(() => {})
}

/** Synthesised two-blade shutter click, no audio file needed. */
export function shutterSound() {
  if (!audio) return
  audio.resume().catch(() => {})
  const rate = audio.sampleRate
  const buf = audio.createBuffer(1, Math.round(rate * 0.14), rate)
  const d = buf.getChannelData(0)
  const click = (i: number, at: number, len: number) => (i < at ? 0 : Math.max(0, 1 - (i - at) / (rate * len)) ** 3)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (click(i, 0, 0.035) + 0.7 * click(i, rate * 0.065, 0.05))
  const src = audio.createBufferSource()
  const gain = audio.createGain()
  gain.gain.value = 0.5
  src.buffer = buf
  src.connect(gain).connect(audio.destination)
  src.start()
}

function burstOf(className: string, ms: number, fill?: (box: HTMLElement) => void) {
  if (reducedMotion()) return
  const box = document.createElement('div')
  box.className = className
  box.setAttribute('aria-hidden', 'true')
  fill?.(box)
  document.body.append(box)
  setTimeout(() => box.remove(), ms)
}

export const flash = () => burstOf('flash', 450)

export const confetti = () =>
  burstOf('confetti', 2600, (box) => {
    const colors = ['#FF4FA3', '#FFD23F', '#3A86FF', '#2EC4B6', '#FF5A36']
    for (let i = 0; i < 70; i++) {
      const bit = document.createElement('i')
      bit.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % 5]};animation-delay:${Math.random() * 0.4}s;--x:${(Math.random() - 0.5) * 240}px;--r:${Math.random() * 900 - 450}deg`
      box.append(bit)
    }
  })

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

/** Native share sheet when the browser can share files, otherwise a plain download. */
export async function shareFile(blob: Blob, name: string, text?: string) {
  const file = new File([blob], name, { type: blob.type })
  if (!navigator.canShare?.({ files: [file] })) return download(blob, name)
  try {
    await navigator.share({ files: [file], text })
  } catch (e) {
    if ((e as Error).name !== 'AbortError') download(blob, name)
  }
}
