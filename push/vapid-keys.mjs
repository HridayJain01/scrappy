// Run once: node push/vapid-keys.mjs. Prints the key pair the push server and the app share.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = Buffer.from(await crypto.subtle.exportKey('raw', publicKey)).toString('base64url')
console.log(`VAPID_PUBLIC_KEY (also VITE_VAPID_PUBLIC_KEY in the app's .env.local):\n${pub}\n`)
console.log(`VAPID_PRIVATE_JWK (secret, never commit):\n${JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey))}`)
