import { calculateRendererPerfStats } from '../rendererPerformance'

describe('renderer performance sampling', () => {
  it('reads the WebGL renderer calls field and calculates one stable sample window', () => {
    // Regression: the scene viewport must reuse the model-viewer sampler contract. Reading
    // a made-up drawCalls field alone would silently report zero for WebGLRenderer.info.
    expect(
      calculateRendererPerfStats(
        {
          render: { calls: 8, triangles: 2400 },
          memory: { geometries: 6, textures: 4 },
        },
        15,
        250
      )
    ).toEqual({
      fps: 60,
      ms: 16.7,
      drawCalls: 8,
      triangles: 2400,
      geometries: 6,
      textures: 4,
    })
  })

  it('does not turn an empty sampling window into infinite performance', () => {
    // Regression: a zero-duration first sample must stay explicitly empty rather than
    // leaking Infinity into structured User Timing detail.
    expect(calculateRendererPerfStats(undefined, 0, 0)).toEqual({
      fps: 0,
      ms: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
    })
  })
})
