import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './shared/styles/tokens.css'
import './index.css'

import { createRoot } from 'react-dom/client'

import App from './app/App'
import { AppProvider } from './app/providers'
import { SceneRenderView } from './features/scenes/components/SceneRenderView'
import { sceneViewpointFromName } from './features/scenes/lib/sceneRenderCamera'
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
 * What to mount: the app, or a single scene drawn for a headless renderer.
 *
 * Branching here rather than behind a route because the app has no router - it
 * is a dock of tabs, and a scene is not addressable by URL. Mounting the render
 * view instead of `<App />` also keeps the dock, the tab bar and the SignalR
 * connection out of a render that only needs pixels, while still sitting inside
 * `AppProvider` so it shares the QueryClient the scene queries expect.
 */
function renderTarget() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('render') !== 'scene') {
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
    />
  )
}

bootstrap()
