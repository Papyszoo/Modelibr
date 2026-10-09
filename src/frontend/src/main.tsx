import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './shared/styles/tokens.css'
import './index.css'

import { createRoot } from 'react-dom/client'

import App from './app/App'
import { AppProvider } from './app/providers'
import { SceneRenderView } from './features/scenes/components/SceneRenderView'
import { sceneViewpointFromName } from './features/scenes/lib/sceneRenderCamera'
import { VfxRenderView } from './features/vfx/components/VfxRenderView'
import { overrideApiBaseUrl } from './lib/apiBase'

async function bootstrap() {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { worker, initDemoData } = await import('./mocks/browser')
    await worker.start({
      serviceWorker: {
        url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
      },
      onUnhandledRequest: 'bypass',
    })
    // Seed demo data (blocks until IDB is ready so first render has data)
    await initDemoData()
  }

  const rootElement = document.getElementById('root')
  if (!rootElement) throw new Error('Failed to find the root element')

  createRoot(rootElement).render(<AppProvider>{renderTarget()}</AppProvider>)
}

/**
 * What to mount: the app, or a single scene or visual effect drawn for a
 * headless renderer.
 *
 * Branching here rather than behind a route because the app has no router - it
 * is a dock of tabs, and a scene is not addressable by URL. Mounting the render
 * view instead of `<App />` also keeps the dock, the tab bar and the SignalR
 * connection out of a render that only needs pixels, while still sitting inside
 * `AppProvider` so it shares the QueryClient the scene queries expect.
 */
function renderTarget() {
  const params = new URLSearchParams(window.location.search)
  const render = params.get('render')
  if (render === 'vfx') {
    return vfxRenderTarget(params)
  }
  if (render !== 'scene') {
    return <App />
  }

  // The renderer's browser lives in the worker container, where the API address
  // baked in for a user's browser generally does not resolve - so it passes the
  // one it uses itself. Applied before the view mounts, because the scene
  // queries and every file URL read it as they go.
  const apiOverride = params.get('api')
  if (apiOverride) {
    overrideApiBaseUrl(apiOverride)
  }

  const sceneId = Number(params.get('sceneId'))
  if (!Number.isInteger(sceneId) || sceneId <= 0) {
    // Reported the same way a missing scene is, so the renderer fails with a
    // message instead of timing out against a blank page.
    window.__SCENE_RENDER__ = {
      ready: true,
      nodesExpected: 0,
      nodesLoaded: 0,
      nodesFailed: 0,
      error: `render=scene needs a positive integer sceneId, got "${params.get('sceneId') ?? ''}"`,
    }
    return null
  }

  return (
    <SceneRenderView
      sceneId={sceneId}
      viewpoint={sceneViewpointFromName(params.get('view'))}
      time={readRenderTime(params.get('t'))}
    />
  )
}

/**
 * The deterministic pose time for `?render=scene`, in seconds.
 *
 * Passed through to every animated node's mixer, so a render does not depend
 * on how long the page has been open and two renders of one scene match. The
 * default is 0: each node shows its own configured start-offset pose. A
 * missing or malformed value falls back to that default rather than failing
 * the render - the picture is still answerable, just not at a caller-chosen
 * time.
 */
function readRenderTime(raw: string | null): number {
  if (raw === null || raw.trim() === '') {
    return 0
  }

  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
}

/** The effect page for `?render=vfx&vfxId=...`; the worker steps its time and photographs it. */
function vfxRenderTarget(params: URLSearchParams) {
  const apiOverride = params.get('api')
  if (apiOverride) {
    overrideApiBaseUrl(apiOverride)
  }

  const vfxId = Number(params.get('vfxId'))
  if (!Number.isInteger(vfxId) || vfxId <= 0) {
    window.__VFX_RENDER__ = {
      ready: true,
      windowSeconds: 0,
      setTime: () => Promise.resolve(),
      error: `render=vfx needs a positive integer vfxId, got "${params.get('vfxId') ?? ''}"`,
    }
    return null
  }

  return <VfxRenderView vfxId={vfxId} />
}

bootstrap()
