// Private albums: Face ID / fingerprint through WebAuthn, with no server. The phone checks it's you and we
// trust its yes. It's a privacy curtain, not encryption: the photos themselves are stored as usual.
import { getSetting, setSetting } from './db.ts'

const bytes = () => crypto.getRandomValues(new Uint8Array(32))
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** True when this device has Face ID, Touch ID, Windows Hello or a fingerprint reader the browser can use. */
export const canLock = async () => !!(await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false))

/** Asks for Face ID / fingerprint. The first time, it registers a key for Scrappy on this device. Call from a tap. */
export async function verify(): Promise<boolean> {
  try {
    const saved = await getSetting('lockKey', '')
    if (!saved) {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: bytes(),
          rp: { name: 'Scrappy' },
          user: { id: bytes(), name: 'scrappy', displayName: 'Scrappy private albums' },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null
      if (!cred) return false
      await setSetting('lockKey', toB64(cred.rawId))
      return true // creating it already required Face ID / fingerprint
    }
    const ok = await navigator.credentials.get({
      publicKey: { challenge: bytes(), allowCredentials: [{ type: 'public-key', id: fromB64(saved) }], userVerification: 'required', timeout: 60_000 },
    })
    return !!ok
  } catch {
    return false // cancelled, or the key was deleted from the device
  }
}
