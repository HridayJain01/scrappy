import { useEffect, useRef, useState, type FormEvent } from 'react'
import { dayKey, db, getSetting, setSetting, useLive } from '../lib/db.ts'
import { shareFile, toast } from '../lib/fx.ts'
import { DEFAULT_MODEL, testKey } from '../lib/gemini.ts'

const backup = () => import('../lib/backup.ts') // JSZip loads only when you back up

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`)

export function Settings() {
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [test, setTest] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState('')
  const [persisted, setPersisted] = useState<boolean>()
  const [quota, setQuota] = useState<number>()
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
    if (!key.trim()) return toast('The API key can’t be empty')
    run('save', async () => {
      await Promise.all([setSetting('apiKey', key.trim()), setSetting('model', model.trim() || DEFAULT_MODEL)])
      toast('Saved ✓')
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

  return (
    <>
      <h1 className="heading text-6xl">Settings</h1>
      <p className="mb-6 font-hand text-2xl">the boring-but-important page</p>

      <form onSubmit={save} className="card mb-7 space-y-4 bg-white p-4">
        <h2 className="heading text-3xl">🤖 Gemini</h2>
        <label className="block">
          <span className="mb-1 block font-bold">API key</span>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block font-bold">Model</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} autoCapitalize="off" spellCheck={false} className="field" />
        </label>
        <div className="flex flex-wrap gap-3">
          <button className="btn bg-sun" disabled={!!busy}>
            💾 Save
          </button>
          <button type="button" className="btn bg-white" onClick={check} disabled={!!busy}>
            {busy === 'test' ? 'Testing…' : '🧪 Test key'}
          </button>
        </div>
        {test && <p className={`rounded-lg border-2 border-ink p-2 font-bold ${test.ok ? 'bg-mint' : 'bg-tomato'}`}>{test.text}</p>}
        <p className="text-sm">
          Need a key? It's free at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="font-bold underline">
            aistudio.google.com/apikey
          </a>
          . It stays on this device.
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
        <p>Photos live only on this device. Export a zip now and then; import it on any device to restore.</p>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn bg-blue"
            disabled={!!busy || !usage?.count}
            onClick={() => run('export', async () => shareFile(await (await backup()).exportBackup(), `scrappy-backup-${dayKey()}.zip`))}
          >
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

      <p className="text-center font-hand text-2xl">Scrappy · made for one very specific person 📸</p>
    </>
  )
}
