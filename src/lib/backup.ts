import JSZip from 'jszip'
import { albumPhotos, BUILTIN_ALBUMS, CATEGORIES, dayKey, db, isBuiltin, setSetting, type Album, type Category, type Photo } from './db.ts'
import { shareFile } from './fx.ts'

// ponytail: JSZip holds the whole archive in memory; fine for thousands of photos, stream it if backups reach ~1 GB.

/**
 * Zip of photos/<id>.jpg + thumbs/<id>.jpg + scrappy.json with captions and your albums (everything except the API key).
 * With `album` (or a list of `photos`) it's a shareable zip of just those, which a friend imports the same way.
 */
export async function exportBackup(only?: { album?: Album; photos?: Photo[] }): Promise<Blob> {
  const zip = new JSZip()
  const photos: Omit<Photo, 'full' | 'thumb'>[] = []
  const add = ({ full, thumb, ...meta }: Photo) => {
    zip.file(`photos/${meta.id}.jpg`, full)
    zip.file(`thumbs/${meta.id}.jpg`, thumb)
    photos.push(only ? { ...meta, fav: undefined } : meta)
  }
  if (only?.album) (await albumPhotos(only.album.id)).forEach(add)
  else if (only?.photos) only.photos.forEach(add)
  else await db.photos.each(add)
  // A shared album travels without its lock: your Face ID means nothing on a friend's phone.
  const albums = !only ? await db.albums.toArray() : only.album && !isBuiltin(only.album.id) ? [{ ...only.album, locked: false, builtin: undefined }] : []
  zip.file('scrappy.json', JSON.stringify({ app: 'scrappy', version: 2, albums, photos }, null, 1))
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }) // JPEGs don't compress
}

/** Exports and hands the zip to the share sheet (iPhone: Save to Files) or downloads it. Remembers how many were saved. */
export async function backUpNow() {
  const count = await db.photos.count()
  if (await shareFile(await exportBackup(), `scrappy-backup-${dayKey()}.zip`)) await setSetting('backupCount', count)
}

/** Restores a backup. Photos keep their ids, so importing the same zip twice doesn't duplicate anything. */
export async function importBackup(file: File): Promise<number> {
  const zip = await JSZip.loadAsync(file).catch(() => {
    throw new Error("That file isn't a zip")
  })
  const json = await zip.file('scrappy.json')?.async('string')
  if (!json) throw new Error('Not a Scrappy backup (scrappy.json is missing)')
  const data = JSON.parse(json)
  const items: unknown = data.photos
  if (!Array.isArray(items)) throw new Error('Backup has no photo list')

  const jpeg = async (path: string) => {
    const f = zip.file(path)
    return f && new Blob([await f.async('arraybuffer')], { type: 'image/jpeg' })
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : undefined)

  // Albums first (v2 backups), rebuilt field by field like everything else: the zip is an untrusted file.
  for (const a of Array.isArray(data.albums) ? data.albums : []) {
    const id = str(a?.id)
    const name = str(a?.name)
    if (!id || !name || !/^#[0-9a-f]{6}$/i.test(a.color)) continue
    await db.albums.put({
      id,
      name: name.slice(0, 30),
      emoji: str(a.emoji)?.slice(0, 16) || '📁',
      color: a.color,
      burst: str(a.burst)?.slice(0, 10) || 'YAY!',
      keywords: strings(a.keywords, 30),
      createdAt: Number.isFinite(a.createdAt) ? a.createdAt : Date.now(),
      cover: str(a.cover),
      locked: a.locked === true || !!(await db.albums.get(id))?.locked, // importing never unlocks a private album
    })
  }
  const known = new Set<string>([...Object.keys(BUILTIN_ALBUMS), ...((await db.albums.toCollection().primaryKeys()) as string[])])

  let count = 0
  for (const m of items) {
    const id = str(m?.id)
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(m.day) || !Number.isFinite(m.takenAt)) continue
    const [full, thumb] = await Promise.all([jpeg(`photos/${id}.jpg`), jpeg(`thumbs/${id}.jpg`)])
    if (!full || !thumb) continue
    await db.photos.put({
      id,
      full,
      thumb,
      ratio: Number(m.ratio) > 0 ? Number(m.ratio) : 1,
      takenAt: m.takenAt,
      day: m.day,
      category: known.has(m.category) ? m.category : 'unsorted',
      aiCategory: CATEGORIES.includes(m.aiCategory) ? (m.aiCategory as Category) : undefined,
      status: m.status === 'done' ? 'done' : 'pending',
      manual: m.manual === true,
      title: str(m.title),
      caption: str(m.caption),
      tags: strings(m.tags, 10) ?? [],
      sticker: str(m.sticker),
      extra: m.extra && typeof m.extra === 'object' ? { label: str(m.extra.label) ?? '', value: str(m.extra.value) ?? '' } : undefined,
      fav: m.fav === true,
      decor: Array.isArray(m.decor)
        ? m.decor
            .filter((d: { e?: unknown; x?: unknown; y?: unknown }) => typeof d?.e === 'string' && Number.isFinite(d.x) && Number.isFinite(d.y))
            .slice(0, 12)
            .map((d: { e: string; x: number; y: number }) => ({ e: d.e.slice(0, 16), x: Math.max(0, Math.min(100, d.x)), y: Math.max(0, Math.min(100, d.y)) }))
        : undefined,
    })
    count++
  }
  return count
}
