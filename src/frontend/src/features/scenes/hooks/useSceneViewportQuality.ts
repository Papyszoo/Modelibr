import { useCallback, useEffect, useRef, useState } from 'react'

export type SceneViewportQuality = 'moving' | 'settling' | 'still'

const CHANGE_IDLE_MS = 90
const SETTLE_MS = 180

export interface SceneViewportQualityController {
  state: SceneViewportQuality
  dpr: number
  shadowsEnabled: boolean
  onControlsStart: () => void
  onControlsChange: () => void
  onControlsEnd: () => void
}

/** The deliberately visible raster-quality reduction used while navigating. */
export function sceneViewportDpr(
  quality: SceneViewportQuality,
  devicePixelRatio: number
): number {
  const finalDpr = Math.min(Math.max(devicePixelRatio, 1), 2)
  if (quality === 'moving') {
    return 1
  }
  if (quality === 'settling') {
    return Math.min(finalDpr, 1.5)
  }
  return finalDpr
}

/**
 * Blender-like interaction policy for the scene editor.
 *
 * Camera movement immediately favours input latency: DPR drops and shadows switch off.
 * The viewport then passes through a short settling state before returning to final editor
 * quality. `change` is included because controls can move programmatically or continue
 * through damping after the pointer has been released.
 */
export function useSceneViewportQuality(
  interactive: boolean
): SceneViewportQualityController {
  const [state, setState] = useState<SceneViewportQuality>('still')
  const interactionActive = useRef(false)
  const changeIdleTimer = useRef<number | null>(null)
  const stillTimer = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (changeIdleTimer.current !== null) {
      window.clearTimeout(changeIdleTimer.current)
      changeIdleTimer.current = null
    }
    if (stillTimer.current !== null) {
      window.clearTimeout(stillTimer.current)
      stillTimer.current = null
    }
  }, [])

  const beginSettling = useCallback(() => {
    setState('settling')
    stillTimer.current = window.setTimeout(() => {
      stillTimer.current = null
      setState('still')
    }, SETTLE_MS)
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const onControlsStart = useCallback(() => {
    if (!interactive) {
      return
    }
    interactionActive.current = true
    clearTimers()
    setState('moving')
  }, [clearTimers, interactive])

  const onControlsChange = useCallback(() => {
    if (!interactive) {
      return
    }
    clearTimers()
    setState('moving')

    if (!interactionActive.current) {
      changeIdleTimer.current = window.setTimeout(() => {
        changeIdleTimer.current = null
        beginSettling()
      }, CHANGE_IDLE_MS)
    }
  }, [beginSettling, clearTimers, interactive])

  const onControlsEnd = useCallback(() => {
    if (!interactive) {
      return
    }
    interactionActive.current = false
    clearTimers()
    beginSettling()
  }, [beginSettling, clearTimers, interactive])

  const effectiveState = interactive ? state : 'still'
  return {
    state: effectiveState,
    dpr: sceneViewportDpr(effectiveState, window.devicePixelRatio),
    shadowsEnabled: effectiveState === 'still',
    onControlsStart,
    onControlsChange,
    onControlsEnd,
  }
}
