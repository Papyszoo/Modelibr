import type { RendererPerfStats } from '@/shared/three/rendererPerformance'

import {
  completeSceneViewportPerformanceSession,
  createSceneViewportPerformanceSession,
  summarizeSceneViewportPerformance,
} from '../scenePerformance'

function rendererSample(
  values: Partial<RendererPerfStats> = {}
): RendererPerfStats {
  return {
    fps: 60,
    ms: 16.7,
    drawCalls: 10,
    triangles: 1000,
    geometries: 5,
    textures: 3,
    ...values,
  }
}

describe('scene viewport performance summaries', () => {
  it('keeps averages and worst renderer pressure from the full sampling window', () => {
    // Regression: a last-frame snapshot hid the cold-load spike that admission budgets
    // need to constrain. The summary must retain both averages and window maxima/minima.
    const session = createSceneViewportPerformanceSession(100, true)
    session.rendererSamples.push(
      rendererSample(),
      rendererSample({
        fps: 20,
        ms: 50,
        drawCalls: 40,
        triangles: 9000,
        geometries: 12,
        textures: 18,
      })
    )
    session.longTaskDurations.push(51.25, 80.5)

    const summary = summarizeSceneViewportPerformance(session, 500)

    expect(summary).toEqual({
      durationMs: 400,
      renderer: {
        sampleCount: 2,
        averageFps: 40,
        minimumFps: 20,
        averageFrameMs: 33.4,
        maximumFrameMs: 50,
        maximumDrawCalls: 40,
        maximumTriangles: 9000,
        maximumGeometries: 12,
        maximumTextures: 18,
      },
      longTasks: {
        supported: true,
        count: 2,
        totalDurationMs: 131.8,
        maximumDurationMs: 80.5,
      },
    })
  })

  it('reports unsupported and unsampled signals honestly instead of zero performance', () => {
    // Regression: treating an unsupported Long Tasks API or a sub-250ms load as zero
    // made a missing measurement look like an exceptionally healthy viewport.
    const summary = summarizeSceneViewportPerformance(
      createSceneViewportPerformanceSession(100, false),
      120
    )

    expect(summary.renderer.averageFps).toBeNull()
    expect(summary.renderer.minimumFps).toBeNull()
    expect(summary.renderer.averageFrameMs).toBeNull()
    expect(summary.renderer.maximumFrameMs).toBeNull()
    expect(summary.longTasks).toEqual({
      supported: false,
      count: 0,
      totalDurationMs: 0,
      maximumDurationMs: 0,
    })
  })

  it('publishes the aggregate as structured User Timing detail', () => {
    // Regression: named timings without renderer/long-task detail cannot calibrate an
    // admission budget; the measurement must carry the summary automation reads.
    const originalMeasure = Object.getOwnPropertyDescriptor(
      performance,
      'measure'
    )
    const measure = jest.fn()
    Object.defineProperty(performance, 'measure', {
      configurable: true,
      value: measure,
    })
    const session = createSceneViewportPerformanceSession(10, false)
    session.rendererSamples.push(rendererSample())

    const summary = completeSceneViewportPerformanceSession(
      'modelibr.scene.test',
      session,
      30
    )

    expect(measure).toHaveBeenCalledWith('modelibr.scene.test', {
      start: 10,
      end: 30,
      detail: summary,
    })
    if (originalMeasure) {
      Object.defineProperty(performance, 'measure', originalMeasure)
    } else {
      delete (performance as Performance & { measure?: Performance['measure'] })
        .measure
    }
  })
})
