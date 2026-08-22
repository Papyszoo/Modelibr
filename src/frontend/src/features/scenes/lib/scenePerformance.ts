import type { RendererPerfStats } from '@/shared/three/rendererPerformance'

export const scenePerformanceMeasures = {
  documentRequest: 'modelibr.scene.document-request',
  resourceManifest: 'modelibr.scene.resource-manifest',
  firstBoundsFrame: 'modelibr.scene.first-bounds-frame',
  resourcesSettled: 'modelibr.scene.resources-settled',
  viewportLoad: 'modelibr.scene.viewport-load',
  cameraMotion: 'modelibr.scene.camera-motion',
} as const

let measureSequence = 0

export interface ScenePerformanceMeasurement {
  end: () => void
  cancel: () => void
}

export interface SceneRendererPerformanceSummary {
  sampleCount: number
  averageFps: number | null
  minimumFps: number | null
  averageFrameMs: number | null
  maximumFrameMs: number | null
  maximumDrawCalls: number
  maximumTriangles: number
  maximumGeometries: number
  maximumTextures: number
}

export interface SceneLongTaskPerformanceSummary {
  supported: boolean
  count: number
  totalDurationMs: number
  maximumDurationMs: number
}

export interface SceneViewportPerformanceSummary {
  durationMs: number
  renderer: SceneRendererPerformanceSummary
  longTasks: SceneLongTaskPerformanceSummary
}

export interface SceneViewportPerformanceSession {
  startedAt: number
  longTaskSupported: boolean
  rendererSamples: RendererPerfStats[]
  longTaskDurations: number[]
}

export function createSceneViewportPerformanceSession(
  startedAt: number,
  longTaskSupported: boolean
): SceneViewportPerformanceSession {
  return {
    startedAt,
    longTaskSupported,
    rendererSamples: [],
    longTaskDurations: [],
  }
}

export function summarizeSceneViewportPerformance(
  session: SceneViewportPerformanceSession,
  endedAt: number
): SceneViewportPerformanceSummary {
  const samples = session.rendererSamples
  const longTasks = session.longTaskDurations
  const average = (values: number[]): number | null =>
    values.length > 0
      ? Number(
          (
            values.reduce((total, value) => total + value, 0) / values.length
          ).toFixed(1)
        )
      : null
  const maximum = (values: number[]): number =>
    values.length > 0 ? Math.max(...values) : 0

  return {
    durationMs: Number(Math.max(0, endedAt - session.startedAt).toFixed(1)),
    renderer: {
      sampleCount: samples.length,
      averageFps: average(samples.map(sample => sample.fps)),
      minimumFps:
        samples.length > 0
          ? Math.min(...samples.map(sample => sample.fps))
          : null,
      averageFrameMs: average(samples.map(sample => sample.ms)),
      maximumFrameMs:
        samples.length > 0 ? maximum(samples.map(sample => sample.ms)) : null,
      maximumDrawCalls: maximum(samples.map(sample => sample.drawCalls)),
      maximumTriangles: maximum(samples.map(sample => sample.triangles)),
      maximumGeometries: maximum(samples.map(sample => sample.geometries)),
      maximumTextures: maximum(samples.map(sample => sample.textures)),
    },
    longTasks: {
      supported: session.longTaskSupported,
      count: longTasks.length,
      totalDurationMs: Number(
        longTasks.reduce((total, duration) => total + duration, 0).toFixed(1)
      ),
      maximumDurationMs: Number(maximum(longTasks).toFixed(1)),
    },
  }
}

/** Stores one aggregate sampling window in User Timing detail for DevTools/automation. */
export function completeSceneViewportPerformanceSession(
  name: string,
  session: SceneViewportPerformanceSession,
  endedAt = globalThis.performance?.now?.() ?? session.startedAt
): SceneViewportPerformanceSummary {
  const summary = summarizeSceneViewportPerformance(session, endedAt)

  try {
    globalThis.performance?.measure?.(name, {
      start: session.startedAt,
      end: endedAt,
      detail: summary,
    })
  } catch {
    // Performance instrumentation is passive and must not affect the viewport.
  }

  return summary
}

/**
 * Starts a User Timing measure that is visible in browser performance recordings.
 *
 * The viewport needs field data before it can choose safe byte/triangle budgets. These
 * marks are intentionally passive: no always-on profiler and no console noise, just named
 * measures a developer can inspect while loading a real scene such as Living Room.
 */
export function beginScenePerformanceMeasure(
  name: string
): ScenePerformanceMeasurement {
  const browserPerformance = globalThis.performance
  if (
    !browserPerformance ||
    typeof browserPerformance.mark !== 'function' ||
    typeof browserPerformance.measure !== 'function'
  ) {
    return { end: () => undefined, cancel: () => undefined }
  }

  const id = ++measureSequence
  const startMark = `${name}:${id}:start`
  const endMark = `${name}:${id}:end`
  let active = true

  try {
    browserPerformance.mark(startMark)
  } catch {
    return { end: () => undefined, cancel: () => undefined }
  }

  const clearMarks = () => {
    browserPerformance.clearMarks?.(startMark)
    browserPerformance.clearMarks?.(endMark)
  }

  return {
    end: () => {
      if (!active) {
        return
      }
      active = false
      try {
        browserPerformance.mark(endMark)
        browserPerformance.measure(name, startMark, endMark)
      } catch {
        // Instrumentation must never turn a successful scene request into a failure.
      } finally {
        clearMarks()
      }
    },
    cancel: () => {
      if (!active) {
        return
      }
      active = false
      clearMarks()
    },
  }
}

export async function measureSceneAsync<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const measurement = beginScenePerformanceMeasure(name)
  try {
    return await operation()
  } finally {
    measurement.end()
  }
}
