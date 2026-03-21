import { setupWorker } from 'msw/browser'

import { seedIfEmpty } from './db/demoDb'
import { dynamicDemoHandlers } from './dynamicDemoHandlers'
import { handlers } from './handlers'

const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'
const activeHandlers = isDemo ? dynamicDemoHandlers : handlers

export const worker = setupWorker(...activeHandlers)

// Seed IndexedDB with demo data on first load
if (isDemo) {
  seedIfEmpty()
}
