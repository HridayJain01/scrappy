import exifr from 'exifr'

/** Decodes via <img>, which applies EXIF orientation in every modern browser (and HEIC on Safari). */
export async function decode(blob: Blob): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = URL.createObjectURL(blob)
  try {
    await img.decode()
    return img
  } catch {
    throw new Error("Couldn't read that image (unsupported format?)")
  } finally {
    URL.revokeObjectURL(img.src)
  }
}

/** Scales so the long side is at most `max` (or the short side, with `side: 'short'`). Never upscales. */
function resize(src: CanvasImageSource, w: number, h: number, max: number, side: 'long' | 'short' = 'long') {
  const s = Math.min(1, max / (side === 'long' ? Math.max(w, h) : Math.min(w, h)))
  const c = document.createElement('canvas')
  c.width = Math.round(w * s)
  c.height = Math.round(h * s)
  const g = c.getContext('2d')!
  g.fillStyle = '#fff' // transparent PNGs would turn black in JPEG
  g.fillRect(0, 0, c.width, c.height)
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** Encodes, then frees the canvas at once (iOS Safari caps total canvas memory, and big imports would hit it). */
export const toJpeg = (c: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((ok, fail) =>
    c.toBlob(
      (b) => {
        c.width = c.height = 0
        return b ? ok(b) : fail(new Error("Couldn't encode JPEG"))
      },
      'image/jpeg',
      quality,
    ),
  )

async function exifDate(file: Blob) {
  try {
    const tags = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const t = +(tags?.DateTimeOriginal ?? tags?.CreateDate)
    return t > 0 && t <= Date.now() ? t : undefined
  } catch {
    return undefined
  }
}

/**
 * Upright JPEGs, plus the capture date. No filters, ever.
 * full: 1600px long side, q0.85. thumb: 400px on the short side, so grid polaroids stay crisp on 3x phone screens.
 */
export async function prepare(file: File) {
  const img = await decode(file)
  const full = resize(img, img.naturalWidth, img.naturalHeight, 1600)
  const ratio = full.width / full.height
  const thumb = resize(full, full.width, full.height, 400, 'short') // drawn before `full` is encoded and freed
  const [fullBlob, thumbBlob, takenAt] = await Promise.all([toJpeg(full, 0.85), toJpeg(thumb, 0.82), exifDate(file)])
  return { full: fullBlob, thumb: thumbBlob, ratio, takenAt: takenAt ?? Date.now() }
}

/** The 768px copy sent to Gemini, derived from the stored full image so retries work the same way. */
export async function aiCopy(full: Blob) {
  const img = await decode(full)
  return toJpeg(resize(img, img.naturalWidth, img.naturalHeight, 768), 0.8)
}
