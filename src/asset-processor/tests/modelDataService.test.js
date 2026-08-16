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

describe('ModelDataService.saveSceneGraph', () => {
  let service
  let putSpy

  beforeEach(() => {
    service = new ModelDataService()
    putSpy = vi.fn().mockResolvedValue({ status: 204 })
    service.apiClient = { put: putSpy }
  })

  const sceneGraph = {
    extractorVersion: 1,
    geometryHashVersion: 1,
    partPathVersion: 1,
    parts: [
      {
        partPath: '/Chair/Leg[0]',
        name: 'Leg',
        parentPath: '/Chair',
        depth: 2,
        objectType: 'mesh',
        source: 'threejs',
        transform: {
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
        triangleCount: 12,
        vertexCount: 8,
        geometryHash: 'aaaa000000000000',
        hasUvs: true,
        uvBounds: null,
        materialSlots: ['Wood'],
        shapeKeys: [],
        vertexGroups: null,
        modifiers: null,
        quadCount: null,
        ngonCount: null,
      },
    ],
    rollups: {
      objectCounts: { mesh: 1 },
      meshCount: 1,
      totalTriangles: 12,
      totalVertices: 8,
      materialCount: 1,
      materialNames: ['Wood'],
      boneCount: 0,
      worldBounds: { min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] },
      unitConfidence: 'medium',
      animationCount: 0,
      animationNames: [],
      animations: [],
      referencedImages: { resolvedCount: 0, unresolved: [] },
    },
    warnings: [],
  }

  it('PUTs to the version scene-graph endpoint with the mapped contract', async () => {
    const ok = await service.saveSceneGraph(42, 'a'.repeat(64), sceneGraph)

    expect(ok).toBe(true)
    expect(putSpy).toHaveBeenCalledTimes(1)
    const [url, body] = putSpy.mock.calls[0]
    expect(url).toBe('/model-versions/42/scene-graph')
    expect(body.fileSha256).toBe('a'.repeat(64))
    expect(body.extractorVersion).toBe(1)
    expect(body.rollups.worldBounds.dimensions).toEqual([1, 1, 1])
    // min/max travel too: they are what tell the server where the origin sits
    // inside the bounds. Sending the size alone made it assume every origin was
    // centred, which floated base-at-origin assets by half their height.
    expect(body.rollups.worldBounds.min).toEqual([0, 0, 0])
    expect(body.rollups.worldBounds.max).toEqual([1, 1, 1])
    expect(body.parts).toHaveLength(1)
    // Promoted columns at the top level, everything else nested under detail.
    expect(body.parts[0].partPath).toBe('/Chair/Leg[0]')
    expect(body.parts[0].geometryHash).toBe('aaaa000000000000')
    expect(body.parts[0].detail.materialSlots).toEqual(['Wood'])
    expect(body.parts[0].detail.vertexGroups).toBeNull()
  })

  it('returns false when the request fails, without throwing', async () => {
    putSpy.mockRejectedValueOnce(new Error('boom'))
    const ok = await service.saveSceneGraph(1, 'a'.repeat(64), sceneGraph)
    expect(ok).toBe(false)
  })
})
