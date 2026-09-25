# Scrappy 📸

A personal photo scrapbook that sorts itself. Snap a photo, Google Gemini works out what it is, and it lands in the right album with a handwritten-style caption.

- **Albums:** Fit Check 👕, Food Diary 🍜, Views 🌅, Weird & Wonderful 🌀, plus Unsorted 📦 while a photo waits for the AI.
- **Screens:** Today (shutter, streak, on-this-day), Albums, Recap (monthly collage you can share as an image) and Settings (key, model, storage, backup).
- **Private by default:** no login, no backend, no cost. Photos live in your browser's IndexedDB on your phone.
- **Offline-friendly:** installable PWA. Photos taken offline wait in Unsorted and get sorted automatically when you're back online.

## 1. Get a free Gemini API key

1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** and sign in with a Google account.
2. Click **Create API key** and copy it (it starts with `AIza…`).
3. Open Scrappy and paste the key on the welcome screen. It's checked, then stored only on your device.

The default model is `gemini-2.5-flash-lite`. You can switch models under **Settings → Model** (for example `gemini-2.5-flash`) without redeploying, and use **Test key** to check the key and model together.

> **Privacy:** to sort a photo, Scrappy sends a small 768px copy to Google Gemini. Nothing else leaves your device. On the free tier Google may use what you send to improve its products, so skip the AI for anything you'd rather keep off Google's servers. You can always move a photo to its album yourself.

## 2. Run it locally

You need [Node.js](https://nodejs.org) 22.18 or newer (the tests rely on Node running TypeScript directly).

```bash
npm install
npm run dev
```

Open http://localhost:5173. Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the production site into `dist/` |
| `npm run preview` | Serves the production build, service worker included, at http://localhost:4173 |
| `npm test` | Runs the logic tests (streaks, dates, AI-response validation) with Node's built-in test runner |

To try it on your phone before deploying, run `npm run dev -- --host` and open the printed network address on the same Wi-Fi. Install and offline mode need HTTPS, so those only work once it's deployed.

## 3. Deploy to Vercel (free)

Scrappy is a static site, so Vercel's free Hobby plan is plenty, and no configuration or environment variables are needed.

**Option A, from GitHub (auto-deploys on every push):**

1. Push this folder to a new GitHub repository:
   ```bash
   git init && git add -A && git commit -m "Scrappy"
   git branch -M main
   git remote add origin https://github.com/<you>/scrappy.git
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub and import the repository.
3. Vercel detects **Vite** automatically (build command `npm run build`, output directory `dist`). Click **Deploy**.
4. You get a URL like `https://scrappy-yourname.vercel.app`. Open it on your phone.

**Option B, from your terminal:**

```bash
npx vercel          # first run: log in and accept the defaults
npx vercel --prod   # deploy to your production URL
```

## 4. Install it on your phone

**Android (Chrome)**
1. Open your Vercel URL in Chrome.
2. Tap **⋮ → Install app** (or **Add to Home screen**), or accept the install banner if one appears.
3. Launch Scrappy from your home screen. It opens full-screen, like a native app.

**iPhone (Safari)**
1. Open your Vercel URL in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Launch Scrappy from your home screen.

After installing, open **Settings → Keep my photos safe** once. This asks the browser for persistent storage so it won't clear your photos when space runs low. Installed apps usually get this automatically.

## Your photos and backups

- Photos are stored only in this browser on this device, as a 1600px JPEG plus a small thumbnail. Nothing is uploaded anywhere else.
- Clearing site data, uninstalling the app, or switching phones loses them. Use **Settings → Export backup** now and then: it saves a zip (on iPhone, pick **Save to Files** in the share sheet) with every photo and a `scrappy.json` of titles, captions and albums (never your API key).
- **Import backup** restores that zip on any device. Importing the same backup twice doesn't create duplicates.

## Good to know

- **Moving photos:** tap a photo's album chip, or use **Move**, to put it somewhere else. Your choice is permanent; the AI never overrides it.
- **Rate limits:** the free tier caps requests per minute and per day. Photos are sorted one at a time (background retries are spaced 4 seconds apart), and anything that hits a limit waits in Unsorted. Tap **Sort now** later, or it retries next time you open the app.
- **iPhone HEIC photos:** Safari hands the app JPEGs, so they just work. Desktop Chrome can't decode HEIC files; convert those to JPEG first.
- **Shutter sound:** it follows your phone's silent switch on iPhone.

## Project layout

```
src/
  lib/db.ts          Dexie schema, albums, queries, date and streak helpers
  lib/images.ts      decode with EXIF orientation, resize, JPEG encode, EXIF date
  lib/gemini.ts      Gemini REST call, prompt, response schema and validation
  lib/sorter.ts      save first, then sort; offline queue and auto-retry
  lib/backup.ts      zip export and import (JSZip, loaded on demand)
  lib/fx.ts          flash, shutter sound, confetti, toasts, share and download
  components/        Today, Booth (capture animation), Albums, PhotoView, Recap, Settings, Onboarding, ui
```

Stack: React, Vite, TypeScript, Tailwind CSS v4, vite-plugin-pwa, Dexie.js, exifr and JSZip.
