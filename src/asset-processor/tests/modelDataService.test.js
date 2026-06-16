import { describe, it, expect, beforeEach, vi } from 'vitest'

import { ModelDataService } from '../modelDataService.js'

// Silence the service's logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

describe('ModelDataService.saveTechnicalMetadata', () => {
  let service
  let putSpy

  beforeEach(() => {
    service = new ModelDataService()
    putSpy = vi.fn().mockResolvedValue({ status: 204 })
    // Replace the axios instance with a stub that records the request body.
    service.apiClient = { put: putSpy }
  })

  it('forwards geometry, animation and bone fields to the API', async () => {
    const ok = await service.saveTechnicalMetadata(42, {
      materialNames: ['Body'],
      triangleCount: 1000,
      vertexCount: 500,
      meshCount: 2,
      materialCount: 1,
      boundingBoxX: 1.5,
      boundingBoxY: 2.5,
      boundingBoxZ: 0.75,
      animationCount: 2,
      animationNames: ['Idle', 'Walk'],
      boneCount: 24,
    })

    expect(ok).toBe(true)
    expect(putSpy).toHaveBeenCalledTimes(1)

    const [url, body] = putSpy.mock.calls[0]
    expect(url).toBe('/model-versions/42/technical-metadata')
    expect(body).toMatchObject({
      triangleCount: 1000,
      boundingBoxX: 1.5,
      boundingBoxY: 2.5,
      boundingBoxZ: 0.75,
      animationCount: 2,
      animationNames: ['Idle', 'Walk'],
      boneCount: 24,
    })
  })

  it('defaults missing animation/bounding-box fields to nulls and empty array', async () => {
    await service.saveTechnicalMetadata(7, {
      materialNames: [],
      triangleCount: null,
      vertexCount: null,
      meshCount: null,
      materialCount: null,
    })

    const [, body] = putSpy.mock.calls[0]
    expect(body.boundingBoxX).toBeNull()
    expect(body.animationCount).toBeNull()
    expect(body.boneCount).toBeNull()
    expect(body.animationNames).toEqual([])
  })
})
