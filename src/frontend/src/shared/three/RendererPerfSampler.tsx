import { useFrame, useThree } from '@react-three/fiber'
import { type MutableRefObject, useRef } from 'react'

import {
  calculateRendererPerfStats,
  type RendererInfoSnapshot,
  type RendererPerfStats,
} from './rendererPerformance'

const SAMPLE_INTERVAL_MS = 250

/**
 * Samples `renderer.info` without causing React renders.
 *
 * A HUD can read `statsRef`; passive telemetry can consume `onSample`. Keeping the
 * sampler shared prevents editor and model-viewer measurements from drifting apart.
 */
export function RendererPerfSampler({
  statsRef,
  onSample,
}: {
  statsRef?: MutableRefObject<RendererPerfStats>
  onSample?: (stats: RendererPerfStats) => void
}): null {
  const gl = useThree(state => state.gl)
  const frames = useRef(0)
  const elapsed = useRef(0)
  const last = useRef(performance.now())

  useFrame(() => {
    const now = performance.now()
    elapsed.current += Math.max(0, now - last.current)
    last.current = now
    frames.current += 1

    if (elapsed.current < SAMPLE_INTERVAL_MS) {
      return
    }

    const info = (gl as unknown as { info?: RendererInfoSnapshot }).info
    const stats = calculateRendererPerfStats(
      info,
      frames.current,
      elapsed.current
    )
    if (statsRef) {
      statsRef.current = stats
    }
    onSample?.(stats)
    frames.current = 0
    elapsed.current = 0
  })

  return null
}
