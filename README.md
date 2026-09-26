# Scrappy 📸

A photo scrapbook that sorts itself. Snap a photo, a small AI running on your phone works out what it is, and the photo lands in the right album with a handwritten-style caption. Anyone can use it: no account, no API key, no server.

- **Albums:** Fit Check 👕, Food Diary 🍜, Views 🌅, Weird & Wonderful 🌀, plus Unsorted 📦 while a photo waits to be sorted.
- **Screens:** Today (shutter, streak, on-this-day), Albums, Recap (monthly collage you can share as an image) and Settings (sorting, optional Gemini key, storage, backup).
- **Private:** photos live in the browser's IndexedDB on each person's own phone and are sorted on that phone. Nothing is uploaded.
- **Offline-friendly:** an installable PWA. Once the AI has downloaded, snapping and sorting work with no connection at all.

## 1. How the sorting works

Scrappy runs OpenAI's [CLIP](https://github.com/openai/CLIP) image model (ViT-B/32, MIT licence) in the browser with [ONNX Runtime Web](https://onnxruntime.ai). CLIP scores each photo against about 230 labels (dishes, scenes, outfit styles, pets, everyday things). The best match picks the album, and templates turn it into a title, caption, tags, sticker and the album's extra line (Dish, Vibe, Fit score or Weirdness).

- **One-time download:** about 70 MB on first launch (a 58 MB model from Hugging Face plus a 14 MB runtime that comes with the app). After that it's cached on the phone and works offline.
- **Speed:** roughly a second per photo on a recent phone.
- **Captions** come from playful templates, so they're less personal than a big language model's.

### Optional: wittier captions with Gemini

Anyone with a free Google Gemini key can add it under **Settings → Smarter captions**:

1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**, sign in and click **Create API key**.
2. Paste it into Settings and tap **Test key**, then **Save**.

With a key, photos are sorted and captioned by Gemini whenever you're online, and by the on-device AI when offline or if Gemini fails. The default model is `gemini-2.5-flash-lite`; you can change it in Settings without redeploying.

> **Privacy with Gemini:** a 768px copy of each photo is sent to Google. On the free tier Google may use it to improve its products. Clear the key to keep everything on the phone.

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
| `npm test` | Runs the logic tests (streaks, dates, sorting and caption rules, Gemini response validation) with Node's built-in test runner |

To try it on your phone before deploying, run `npm run dev -- --host` and open the printed network address on the same Wi-Fi. Install and offline mode need HTTPS, so those only work once it's deployed (and the AI re-downloads each visit over plain HTTP).

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

Install *before* taking photos on iPhone: Safari and the installed app keep separate storage, so photos taken in a Safari tab don't show up in the installed app.

Scrappy asks the browser for persistent storage after your first photo, so it won't clear your scrapbook when space runs low. If Settings still shows **Keep my photos safe**, tap it.

## Your photos and backups

- Photos are stored only in this browser on this device, as a 1600px JPEG plus a small thumbnail. Nothing is uploaded anywhere else.
- Clearing site data, uninstalling the app, or switching phones loses them. Use **Settings → Export backup** now and then: it saves a zip (on iPhone, pick **Save to Files** in the share sheet) with every photo and a `scrappy.json` of titles, captions and albums (never your API key).
- **Import backup** restores that zip on any device. Importing the same backup twice doesn't create duplicates.
- Today shows a reminder with a **Back up** button once 25 photos have piled up since your last backup.

## Good to know

- **Moving photos:** tap a photo's album chip, or use **Move**, to put it somewhere else. Your choice is permanent; the AI never overrides it.
- **Unsorted:** a photo only waits there if it couldn't be sorted yet, for example when you snap before the first AI download finishes, or offline before it ever downloaded. It's sorted automatically when possible, or tap **Sort now**.
- **Gemini rate limits:** the free tier caps requests per minute and per day, so with a key, background retries are spaced 4 seconds apart. Anything Gemini can't handle is sorted on-device instead.
- **Changing the labels:** edit `src/lib/vocab.ts`, then regenerate the label embeddings with `npm i --no-save @huggingface/transformers && node scripts/embed-labels.ts` (downloads CLIP's ~250 MB text model once). `npm test` fails if you forget.
- **iPhone HEIC photos:** Safari hands the app JPEGs, so they just work. Desktop Chrome can't decode HEIC files; convert those to JPEG first.
- **Shutter sound:** it follows your phone's silent switch on iPhone.

## Project layout

```
src/
  lib/db.ts          Dexie schema, albums, queries, date and streak helpers
  lib/images.ts      decode with EXIF orientation, resize, JPEG encode, EXIF date
  lib/vocab.ts       the on-device AI's labels, scoring and caption templates
  lib/clip.ts        CLIP preprocessing and the worker bridge
  lib/clip.worker.ts model download/cache and inference (ONNX Runtime Web), off the main thread
  lib/label-embeddings.json   precomputed label embeddings (generated by scripts/embed-labels.ts)
  lib/gemini.ts      optional Gemini REST call, prompt, response schema and validation
  lib/sorter.ts      save first, then sort (Gemini or on-device); retry queue
  lib/backup.ts      zip export and import (JSZip, loaded on demand)
  lib/fx.ts          flash, shutter sound, confetti, toasts, share and download
  components/        Today, Booth (capture animation), Albums, PhotoView, Recap, Settings, Onboarding, ui
```

Stack: React, Vite, TypeScript, Tailwind CSS v4, vite-plugin-pwa, Dexie.js, exifr, JSZip and ONNX Runtime Web, running OpenAI's CLIP ViT-B/32 (MIT).
