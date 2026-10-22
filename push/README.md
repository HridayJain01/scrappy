# Scrappy push server

Lets the daily nudge reach phones with the app closed. A Cloudflare Worker (free tier is plenty).

```bash
cd push
node vapid-keys.mjs                       # save both values
npx wrangler login
npx wrangler kv namespace create SUBS     # paste the id into wrangler.toml
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler deploy                       # prints https://scrappy-push.<you>.workers.dev
```

Set `VAPID_SUBJECT` in `wrangler.toml` to your email, then in the app's `.env.local`:

```
VITE_PUSH_URL=https://scrappy-push.<you>.workers.dev
VITE_VAPID_PUBLIC_KEY=<the public key>
```

Rebuild and redeploy the app. Without these two vars the app falls back to reminders that only fire while it's open.
