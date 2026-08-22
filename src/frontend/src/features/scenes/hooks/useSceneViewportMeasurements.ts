import { useCallback, useEffect, useRef } from 'react'

import type { RendererPerfStats } from '@/shared/three/rendererPerformance'

import {
  beginScenePerformanceMeasure,
  completeSceneViewportPerformanceSession,
  createSceneViewportPerformanceSession,
  type ScenePerformanceMeasurement,
  scenePerformanceMeasures,
  type SceneViewportPerformanceSession,
} from '../lib/scenePerformance'
import type { SceneViewportQuality } from './useSceneViewportQuality'

interface SceneViewportMeasurementInput {
  enabled: boolean
  resourceSignature: string
  resourceCount: number
  completedResourceCount: number
  qualityState: SceneViewportQuality
}

interface SceneViewportMeasurements {
  onRendererSample: (stats: RendererPerfStats) => void
}

type LongTaskPerformanceObserver = PerformanceObserver & {
  observe(options: { type: 'longtask'; buffered?: boolean }): void
}

function startLongTaskObserver(onEntry: (entry: PerformanceEntry) => void): {
  observer: PerformanceObserver | null
  supported: boolean
} {
  const Observer = globalThis.PerformanceObserver
  if (!Observer) {
    return { observer: null, supported: false }
  }

  const supportedEntryTypes = (
    Observer as typeof PerformanceObserver & {
      supportedEntryTypes?: readonly string[]
    }
  ).supportedEntryTypes
  if (supportedEntryTypes && !supportedEntryTypes.includes('longtask')) {
    return { observer: null, supported: false }
  }

  try {
    const observer = new Observer(list => {
      for (const entry of list.getEntries()) {
        onEntry(entry)
      }
    }) as LongTaskPerformanceObserver
    observer.observe({ type: 'longtask', buffered: false })
    return { observer, supported: true }
  } catch {
    return { observer: null, supported: false }
  }
}

/** Records passive User Timing entries for the progressive viewport pipeline. */
export function useSceneViewportMeasurements({
  enabled,
  resourceSignature,
  resourceCount,
  completedResourceCount,
  qualityState,
}: SceneViewportMeasurementInput): SceneViewportMeasurements {
  const resourceMeasurement = useRef<ScenePerformanceMeasurement | null>(null)
  const loadSession = useRef<SceneViewportPerformanceSession | null>(null)
  const motionSession = useRef<SceneViewportPerformanceSession | null>(null)
  const longTaskSupported = useRef(false)

  const onRendererSample = useCallback((stats: RendererPerfStats) => {
    loadSession.current?.rendererSamples.push(stats)
    motionSession.current?.rendererSamples.push(stats)
  }, [])

  useEffect(() => {
    if (!enabled) {
      longTaskSupported.current = false
      return
    }

    const { observer, supported } = startLongTaskObserver(entry => {
      if (entry.duration <= 0) {
        return
      }
      if (
        loadSession.current &&
        entry.startTime >= loadSession.current.startedAt
      ) {
        loadSession.current.longTaskDurations.push(entry.duration)
      }
      if (
        motionSession.current &&
        entry.startTime >= motionSession.current.startedAt
      ) {
        motionSession.current.longTaskDurations.push(entry.duration)
      }
    })
    longTaskSupported.current = supported

    return () => observer?.disconnect()
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const measurement = beginScenePerformanceMeasure(
      scenePerformanceMeasures.firstBoundsFrame
    )
    const frame = requestAnimationFrame(measurement.end)
    return () => {
      cancelAnimationFrame(frame)
      measurement.cancel()
    }
  }, [enabled])

  useEffect(() => {
    resourceMeasurement.current?.cancel()
    resourceMeasurement.current = null
    loadSession.current = null

    if (!enabled || resourceCount === 0) {
      return
    }

    const measurement = beginScenePerformanceMeasure(
      scenePerformanceMeasures.resourcesSettled
    )
    resourceMeasurement.current = measurement
    loadSession.current = createSceneViewportPerformanceSession(
      performance.now(),
      longTaskSupported.current
    )

    return () => {
      measurement.cancel()
      if (resourceMeasurement.current === measurement) {
        resourceMeasurement.current = null
      }
      loadSession.current = null
    }
  }, [enabled, resourceCount, resourceSignature])

  useEffect(() => {
    if (
      resourceCount > 0 &&
      completedResourceCount >= resourceCount &&
      resourceMeasurement.current
    ) {
      resourceMeasurement.current.end()
      resourceMeasurement.current = null
      if (loadSession.current) {
        completeSceneViewportPerformanceSession(
          scenePerformanceMeasures.viewportLoad,
          loadSession.current
        )
        loadSession.current = null
      }
    }
  }, [completedResourceCount, resourceCount])

  useEffect(() => {
    if (enabled && qualityState === 'moving') {
      motionSession.current ??= createSceneViewportPerformanceSession(
        performance.now(),
        longTaskSupported.current
      )
      return
    }

    if (motionSession.current) {
      completeSceneViewportPerformanceSession(
        scenePerformanceMeasures.cameraMotion,
        motionSession.current
      )
      motionSession.current = null
    }
  }, [enabled, qualityState])

  useEffect(
    () => () => {
      loadSession.current = null
      motionSession.current = null
    },
    []
  )

  return { onRendererSample }
}
