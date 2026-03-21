import { setupWorker } from 'msw/browser'

import { demoHandlers } from './demoHandlers'
import { handlers } from './handlers'

const activeHandlers =
  import.meta.env.VITE_DEMO_MODE === 'true' ? demoHandlers : handlers

export const worker = setupWorker(...activeHandlers)
