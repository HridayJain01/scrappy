// Scrappy's push server: remembers each phone's reminder hour and, once an hour, sends an empty "wake up" push
// to phones whose hour it is. The phone's service worker writes the actual message from its own data (public/push-sw.js),
// so nothing about your photos ever leaves the phone. The only thing stored here is "already snapped today".
// ponytail: one KV list per hourly run, fine for thousands of phones; shard by hour if it grows past that.

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)))

async function vapidJwt(endpoint, env) {
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${b64url(sig)}`
}

// No payload, so no payload encryption: just a signed poke.
const poke = async (endpoint, env) =>
  fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `vapid t=${await vapidJwt(endpoint, env)}, k=${env.VAPID_PUBLIC_KEY}`, TTL: '3600', Urgency: 'normal' },
  })

const localNow = (tz) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour }
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type' }

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (new URL(req.url).pathname !== '/sub') return new Response('Scrappy push 📸', { headers: cors })
    const body = await req.json().catch(() => null)
    const endpoint = body?.endpoint
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return new Response('bad endpoint', { status: 400, headers: cors })
    const id = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
    if (req.method === 'DELETE') {
      await env.SUBS.delete(id)
      return new Response('bye', { headers: cors })
    }
    const { hour, tz, doneDay } = body
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return new Response('bad hour', { status: 400, headers: cors })
    try {
      localNow(tz)
    } catch {
      return new Response('bad tz', { status: 400, headers: cors })
    }
    await env.SUBS.put(id, JSON.stringify({ endpoint, hour, tz, doneDay: typeof doneDay === 'string' ? doneDay : '', sentDay: '' }))
    return new Response('ok', { headers: cors })
  },

  async scheduled(_event, env) {
    let cursor
    do {
      const page = await env.SUBS.list({ cursor })
      cursor = page.list_complete ? undefined : page.cursor
      for (const { name } of page.keys) {
        const sub = await env.SUBS.get(name, 'json')
        if (!sub) continue
        const { day, hour } = localNow(sub.tz)
        if (hour < sub.hour || sub.doneDay === day || sub.sentDay === day) continue // catches up if a cron run was missed
        const res = await poke(sub.endpoint, env)
        if (res.status === 404 || res.status === 410) await env.SUBS.delete(name) // phone unsubscribed or app uninstalled
        else if (res.ok) await env.SUBS.put(name, JSON.stringify({ ...sub, sentDay: day }))
      }
    } while (cursor)
  },
}
