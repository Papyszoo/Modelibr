import { setupWorker } from 'msw/browser'

import { seedIfEmpty } from './db/demoDb'
import {
  ensureDemoDataShape,
  prewarmSeedEnvironmentMapThumbnails,
  prewarmSeedSoundWaveforms,
  prewarmSeedThumbnails,
} from './dynamic-demo/shared'
import { dynamicDemoHandlers } from './dynamicDemoHandlers'
import { handlers } from './handlers'

const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'
const activeHandlers = isDemo ? dynamicDemoHandlers : handlers

export const worker = setupWorker(...activeHandlers)

/**
 * Seed demo data and pre-warm all thumbnails/waveforms.
 * Must be awaited before the first prewarm call to avoid races.
 */
export async function initDemoData(): Promise<void> {
  await seedIfEmpty()
  await ensureDemoDataShape()
  // Fire-and-forget: pre-generate seed thumbnails/waveforms in the background
  prewarmSeedThumbnails()
  prewarmSeedEnvironmentMapThumbnails()
  prewarmSeedSoundWaveforms()
}
