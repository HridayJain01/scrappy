import { useEffect, useState } from 'react'
import { AlbumView, Albums } from './components/Albums.tsx'
import { Onboarding } from './components/Onboarding.tsx'
import { PhotoView } from './components/PhotoView.tsx'
import { Recap } from './components/Recap.tsx'
import { Settings } from './components/Settings.tsx'
import { Today } from './components/Today.tsx'
import { AlbumsContext, TabBar, Toaster, UpdateBanner } from './components/ui.tsx'
import { FAVS, getSetting, hiddenAlbums, loadAlbums, setSetting, unlockedAlbums, useLive } from './lib/db.ts'
import { sortPending } from './lib/sorter.ts'

// Routes: #/  #/albums  #/album/<id>  #/recap  #/settings  #/photo/<scope>/<photoId>
// A photo opens as an overlay on top of the screen its scope belongs to, so that screen keeps its scroll and state.
const screenOf = (scope: string) =>
  scope.startsWith('c:') ? `album/${scope.slice(2)}` : scope.startsWith('m:') || scope.startsWith('y:') ? 'recap' : scope.startsWith('s:') ? 'albums' : ''

// Deep link (e.g. a refresh inside a photo)? Put its parent screen underneath in history so "back" stays in the app.
{
  const [, page, scope = ''] = location.hash.split('/')
  if (page === 'album' || page === 'photo') {
    const deep = location.hash
    history.replaceState(null, '', `#/${page === 'album' ? 'albums' : screenOf(scope)}`)
    history.pushState(null, '', deep)
  }
}

function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => {
      const wasPhoto = hash.startsWith('#/photo/')
      if (!wasPhoto && !location.hash.startsWith('#/photo/')) scrollTo(0, 0)
      setHash(location.hash)
    }
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [hash])
  return hash
}

export default function App() {
  // Early versions onboarded by pasting a Gemini key, so a saved key also counts as onboarded.
  const onboarded = useLive(async () => (await getSetting('onboarded', false)) || !!(await getSetting('apiKey', '')))
  const albums = useLive(loadAlbums)
  const hash = useHash()
  useEffect(() => {
    if (!onboarded) return
    void setSetting('onboarded', true) // so removing a Gemini key later never sends you back to onboarding
    void sortPending() // retry anything left unsorted last time
  }, [onboarded])

  if (onboarded === undefined || !albums) return null
  if (!onboarded) return <Onboarding />

  // Before any screen queries photos, so they all skip private albums you haven't unlocked.
  hiddenAlbums.clear()
  for (const a of albums) if (a.locked && !unlockedAlbums.has(a.id)) hiddenAlbums.add(a.id)

  const [, page = '', a = '', b = ''] = hash.split('/')
  const [base, arg] = (page === 'photo' ? screenOf(a) : `${page}/${a}`).split('/')
  const screen =
    base === 'albums' ? <Albums /> :
    base === 'album' ? arg === FAVS.id || albums.some((al) => al.id === arg) ? <AlbumView key={arg} id={arg} /> : <Albums /> :
    base === 'recap' ? <Recap /> :
    base === 'settings' ? <Settings /> :
    <Today />

  return (
    <AlbumsContext.Provider value={albums}>
      <main className="mx-auto max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+7rem)]">
        <UpdateBanner />
        {screen}
      </main>
      <TabBar current={base === 'album' ? 'albums' : (base ?? '')} />
      {page === 'photo' && b && <PhotoView key={a} scope={a} id={b} />}
      <Toaster />
    </AlbumsContext.Provider>
  )
}
