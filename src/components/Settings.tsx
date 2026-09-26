import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isModelCached, warmUp } from '../lib/clip.ts'
import { db, getSetting, setSetting, useLive } from '../lib/db.ts'
import { toast } from '../lib/fx.ts'
import { DEFAULT_MODEL, testKey } from '../lib/gemini.ts'
import { useModelProgress } from './ui.tsx'

const backup = () => import('../lib/backup.ts') // JSZip loads only when you back up

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`)

export function Settings() {
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [test, setTest] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState('')
  const [persisted, setPersisted] = useState<boolean>()
  const [quota, setQuota] = useState<number>()
  const [cached, setCached] = useState<boolean>()
  const download = useModelProgress()
  const importer = useRef<HTMLInputElement>(null)
  const usage = useLive(async () => {
    let count = 0
    let bytes = 0
    await db.photos.each((p) => {
      count++
      bytes += p.full.size + p.thumb.size
    })
    return { count, bytes }
  })

  useEffect(() => {
    getSetting('apiKey', '').then(setKey)
    getSetting('model', DEFAULT_MODEL).then(setModel)
    isModelCached().then(setCached)
    navigator.storage?.persisted?.().then(setPersisted)
    navigator.storage?.estimate?.().then((e) => setQuota(e.quota))
  }, [])

  async function run(label: string, job: () => Promise<unknown>) {
    setBusy(label)
    try {
      await job()
    } catch (e) {
      toast(`😵 ${(e as Error).message}`)
    }
    setBusy('')
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    run('save', async () => {
      await Promise.all([setSetting('apiKey', key.trim()), setSetting('model', model.trim() || DEFAULT_MODEL)])
      toast(key.trim() ? 'Saved ✓ Gemini will write the captions' : 'Saved ✓ Everything stays on this phone')
    })
  }

  const check = () =>
    run('test', async () => {
      setTest(undefined)
      try {
        await testKey(key.trim(), model.trim() || DEFAULT_MODEL)
        setTest({ ok: true, text: `✅ Key works with ${model.trim() || DEFAULT_MODEL}` })
      } catch (e) {
        setTest({ ok: false, text: `❌ ${(e as Error).message}` })
      }
    })

  const persist = () =>
    run('persist', async () => {
      const ok = await navigator.storage.persist()
      setPersisted(ok)
      toast(ok ? '📌 Locked in: the browser won’t clear your photos' : 'The browser said no. Install Scrappy to your home screen, then try again.')
    })

  const downloading = download > 0 && download < 1
  return (
    <>
      <h1 className="heading text-6xl">Settings</h1>
      <p className="mb-6 font-hand text-2xl">the boring-but-important page</p>

      <section className="card mb-7 space-y-3 bg-white p-4">
        <h2 className="heading text-3xl">🧠 Sorting</h2>
        {downloading ? (
          <p className="font-bold">Downloading my sorting brain… {Math.round(download * 100)}%</p>
        ) : download === 1 || cached ? (
          <p>✅ The on-device AI is ready. It sorts and captions photos right here on your phone, even offline.</p>
        ) : (
          cached === false && (
            <>
              <p>The on-device AI isn't downloaded yet. It's about 70 MB, one time only.</p>
              <button className="btn bg-mint" onClick={() => void warmUp()}>
                ⬇️ Download now
              </button>
            </>
          )
        )}
      </section>

      <form onSubmit={save} className="card mb-7 space-y-4 bg-white p-4">
        <h2 className="heading text-3xl">✨ Smarter captions</h2>
        <p className="text-sm">
          Optional. Add a free Google Gemini key and Gemini writes wittier captions whenever you're online. A 768px copy of each photo is then
          sent to Google. Leave it empty to keep everything on this phone.
        </p>
        <label className="block">
          <span className="mb-1 block font-bold">Gemini API key</span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Empty = on-device only"
            autoComplete="off"
            spellCheck={false}
            className="field"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-bold">Model</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} autoCapitalize="off" spellCheck={false} className="field" />
        </label>
        <div className="flex flex-wrap gap-3">
          <button className="btn bg-sun" disabled={!!busy}>
            💾 Save
          </button>
          <button type="button" className="btn bg-white" onClick={check} disabled={!!busy || !key.trim()}>
            {busy === 'test' ? 'Testing…' : '🧪 Test key'}
          </button>
        </div>
        {test && <p className={`rounded-lg border-2 border-ink p-2 font-bold ${test.ok ? 'bg-mint' : 'bg-tomato'}`}>{test.text}</p>}
        <p className="text-sm">
          Get a key at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="font-bold underline">
            aistudio.google.com/apikey
          </a>
          . It's stored only on this device.
        </p>
      </form>

      <section className="card mb-7 space-y-3 bg-white p-4">
        <h2 className="heading text-3xl">💾 Storage</h2>
        {usage && (
          <p className="font-bold">
            {usage.count} photo{usage.count === 1 ? '' : 's'} · {mb(usage.bytes)} used
            {quota ? ` · ~${mb(quota)} available to the browser` : ''}
          </p>
        )}
        {persisted ? (
          <p>📌 Persistent storage is on. The browser won't clear your scrapbook to save space.</p>
        ) : (
          persisted === false && (
            <>
              <p>Right now the browser may clear your photos if the device runs low on space.</p>
              <button className="btn bg-mint" onClick={persist} disabled={!!busy}>
                📌 Keep my photos safe
              </button>
            </>
          )
        )}
      </section>

      <section className="card mb-7 space-y-3 bg-white p-4">
        <h2 className="heading text-3xl">📦 Backup</h2>
        <p>Photos live only on this device. Export a zip now and then (on iPhone, choose Save to Files); import it on any device to restore.</p>
        <div className="flex flex-wrap gap-3">
          <button className="btn bg-blue" disabled={!!busy || !usage?.count} onClick={() => run('export', async () => (await backup()).backUpNow())}>
            {busy === 'export' ? 'Zipping…' : '⬇️ Export backup'}
          </button>
          <button className="btn bg-white" disabled={!!busy} onClick={() => importer.current?.click()}>
            {busy === 'import' ? 'Importing…' : '⬆️ Import backup'}
          </button>
          <input
            ref={importer}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) run('import', async () => toast(`Imported ${await (await backup()).importBackup(file)} photos 🎉`))
            }}
          />
        </div>
      </section>

      <p className="text-center font-hand text-2xl">Scrappy · sorted on your phone, kept on your phone 📸</p>
    </>
  )
}
