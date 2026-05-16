import { describe, it, expect, beforeEach } from 'vitest'

import {
  config,
  refreshThumbnailRenderConfigFromApi,
} from '../config.js'

// Snapshot defaults so each test starts from a clean slate
const originalRendering = { ...config.rendering }
const originalOrbit = { ...config.orbit }

beforeEach(() => {
  Object.assign(config.rendering, originalRendering)
  Object.assign(config.orbit, originalOrbit)
})

/** Build a mock apiClient matching the JobApiClient shape used by the function under test. */
function makeApiClient(handler) {
  return {
    apiClient: {
      get: handler,
    },
  }
}

describe('refreshThumbnailRenderConfigFromApi', () => {
  it('applies a square size to both width and height when animated', async () => {
    const apiClient = makeApiClient(async () => ({
      data: { size: 512, frameCount: 30, isAnimated: true },
    }))

    await refreshThumbnailRenderConfigFromApi(apiClient)

    expect(config.rendering.outputWidth).toBe(512)
    expect(config.rendering.outputHeight).toBe(512)
    // angleRange (360) / frameCount (30) = 12 deg/frame
    expect(config.orbit.angleStep).toBe(12)
  })

  it('collapses to a single frame when isAnimated is false (angleStep == angleRange)', async () => {
    const apiClient = makeApiClient(async () => ({
      data: { size: 256, frameCount: 30, isAnimated: false },
    }))

    await refreshThumbnailRenderConfigFromApi(apiClient)

    const angleRange = config.orbit.endAngle - config.orbit.startAngle
    expect(config.orbit.angleStep).toBe(angleRange)
  })

  it('honors a custom frameCount when animated', async () => {
    const apiClient = makeApiClient(async () => ({
      data: { size: 256, frameCount: 60, isAnimated: true },
    }))

    await refreshThumbnailRenderConfigFromApi(apiClient)

    expect(config.orbit.angleStep).toBe(6) // 360 / 60
  })

  it('defaults to frameCount=30 when the payload omits it', async () => {
    const apiClient = makeApiClient(async () => ({
      data: { size: 256, isAnimated: true },
    }))

    await refreshThumbnailRenderConfigFromApi(apiClient)

    expect(config.orbit.angleStep).toBe(12) // 360 / 30
  })

  it('accepts each value in the allowed size set', async () => {
    for (const size of [64, 128, 256, 512, 1024, 2048]) {
      const apiClient = makeApiClient(async () => ({
        data: { size, frameCount: 30, isAnimated: true },
      }))
      await refreshThumbnailRenderConfigFromApi(apiClient)
      expect(config.rendering.outputWidth).toBe(size)
      expect(config.rendering.outputHeight).toBe(size)
    }
  })

  it('ignores a size outside the allowed set (e.g. 300)', async () => {
    config.rendering.outputWidth = 256
    config.rendering.outputHeight = 256
    const apiClient = makeApiClient(async () => ({
      data: { size: 300, frameCount: 30, isAnimated: true },
    }))

    await refreshThumbnailRenderConfigFromApi(apiClient)

    expect(config.rendering.outputWidth).toBe(256)
    expect(config.rendering.outputHeight).toBe(256)
  })

  it('ignores a non-numeric size', async () => {
    config.rendering.outputWidth = 256
    config.rendering.outputHeight = 256
    const apiClient = makeApiClient(async () => ({
      data: { size: 'oops', frameCount: 30, isAnimated: true },
    }))

    await refreshThumbnailRenderConfigFromApi(apiClient)

    expect(config.rendering.outputWidth).toBe(256)
    expect(config.rendering.outputHeight).toBe(256)
  })

  it('treats isAnimated=undefined as animated (defaults to true)', async () => {
    const apiClient = makeApiClient(async () => ({
      data: { size: 256, frameCount: 30 },
    }))

    await refreshThumbnailRenderConfigFromApi(apiClient)

    // angleStep should be the animated computation, not the collapse-to-1-frame value
    expect(config.orbit.angleStep).toBe(12)
  })

  it('leaves config untouched when the API call rejects', async () => {
    config.rendering.outputWidth = 200
    config.rendering.outputHeight = 200
    config.orbit.angleStep = 9 // deliberately non-default

    const apiClient = makeApiClient(async () => {
      throw new Error('Network unreachable')
    })

    await refreshThumbnailRenderConfigFromApi(apiClient)

    expect(config.rendering.outputWidth).toBe(200)
    expect(config.rendering.outputHeight).toBe(200)
    expect(config.orbit.angleStep).toBe(9)
  })
})
