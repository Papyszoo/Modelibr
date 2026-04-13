import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './index.css'

import { createRoot } from 'react-dom/client'

import App from './app/App'
import { AppProvider } from './app/providers'

async function bootstrap() {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { worker, initDemoData } = await import('./mocks/browser')
    await worker.start({
      serviceWorker: {
        url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
      },
      onUnhandledRequest: 'bypass',
    })
    // Seed demo data then pre-generate thumbnails/waveforms in the background
    void initDemoData()
  }

  const rootElement = document.getElementById('root')
  if (!rootElement) throw new Error('Failed to find the root element')

  createRoot(rootElement).render(
    <AppProvider>
      <App />
    </AppProvider>
  )
}

bootstrap()
