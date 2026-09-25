import JSZip from 'jszip'
import { ALBUMS, db, type Photo } from './db.ts'

// ponytail: JSZip holds the whole archive in memory; fine for thousands of photos, stream it if backups reach ~1 GB.

/** Zip of photos/<id>.jpg + thumbs/<id>.jpg + scrappy.json (everything except the API key). */
export async function exportBackup(): Promise<Blob> {
  const zip = new JSZip()
  const photos: Omit<Photo, 'full' | 'thumb'>[] = []
  await db.photos.each(({ full, thumb, ...meta }) => {
    zip.file(`photos/${meta.id}.jpg`, full)
    zip.file(`thumbs/${meta.id}.jpg`, thumb)
    photos.push(meta)
  })
  zip.file('scrappy.json', JSON.stringify({ app: 'scrappy', version: 1, photos }, null, 1))
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }) // JPEGs don't compress
}

/** Restores a backup. Photos keep their ids, so importing the same zip twice doesn't duplicate anything. */
export async function importBackup(file: File): Promise<number> {
  const zip = await JSZip.loadAsync(file).catch(() => {
    throw new Error("That file isn't a zip")
  })
  const json = await zip.file('scrappy.json')?.async('string')
  if (!json) throw new Error('Not a Scrappy backup (scrappy.json is missing)')
  const items: unknown = JSON.parse(json).photos
  if (!Array.isArray(items)) throw new Error('Backup has no photo list')

  const jpeg = async (path: string) => {
    const f = zip.file(path)
    return f && new Blob([await f.async('arraybuffer')], { type: 'image/jpeg' })
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  let count = 0
  for (const m of items) {
    // Rebuild each record field by field: the zip is an untrusted file.
    const id = str(m?.id)
    if (!id || !Object.hasOwn(ALBUMS, m.category) || !/^\d{4}-\d{2}-\d{2}$/.test(m.day) || !Number.isFinite(m.takenAt)) continue
    const [full, thumb] = await Promise.all([jpeg(`photos/${id}.jpg`), jpeg(`thumbs/${id}.jpg`)])
    if (!full || !thumb) continue
    await db.photos.put({
      id,
      full,
      thumb,
      ratio: Number(m.ratio) > 0 ? Number(m.ratio) : 1,
      takenAt: m.takenAt,
      day: m.day,
      category: m.category,
      status: m.status === 'done' ? 'done' : 'pending',
      manual: m.manual === true,
      title: str(m.title),
      caption: str(m.caption),
      tags: Array.isArray(m.tags) ? m.tags.filter((t: unknown) => typeof t === 'string') : [],
      sticker: str(m.sticker),
      extra: m.extra && typeof m.extra === 'object' ? { label: str(m.extra.label) ?? '', value: str(m.extra.value) ?? '' } : undefined,
    })
    count++
  }
  return count
}
