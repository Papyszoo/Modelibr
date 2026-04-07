import { setupWorker } from 'msw/browser'

import { seedIfEmpty } from './db/demoDb'
import { ensureDemoDataShape } from './dynamic-demo/shared'
import {
  dynamicDemoHandlers,
  prewarmSeedThumbnails,
} from './dynamicDemoHandlers'
import { handlers } from './handlers'

const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'
const activeHandlers = isDemo ? dynamicDemoHandlers : handlers

export const worker = setupWorker(...activeHandlers)
export { prewarmSeedThumbnails }

// Seed IndexedDB with demo data on first load
if (isDemo) {
  void (async () => {
    await seedIfEmpty()
    await ensureDemoDataShape()
  })()
}
