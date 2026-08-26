import { act, renderHook, waitFor } from '@testing-library/react'

import { client } from '@/lib/apiBase'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'

import type {
  SceneAssetRef,
  SceneDocument,
  SceneNode,
  SceneResource,
} from '../../types'
import {
  sceneSourceResolutionError,
  useSceneAssetSources,
} from '../useSceneAssetSources'

const mockPost = client.post as jest.Mock

function node(id: string, asset: SceneAssetRef): SceneNode {
  return {
    id,
    name: id,
    asset,
    primitive: null,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
  }
}

function documentWith(nodes: SceneNode[]): SceneDocument {
  return {
    schemaVersion: 1,
    units: 'meters',
    nodes,
    lights: [],
    environment: null,
  }
}

function resource(asset: SceneAssetRef): SceneResource {
  return {
    asset,
    resolved: true,
    original: {
      fileId: asset.assetId * 10,
      originalFileName: `${asset.assetId}.glb`,
      format: 'glb',
      mimeType: 'model/gltf-binary',
      sizeBytes: 100,
      sha256Hash: 'b'.repeat(64),
    },
    totalSizeBytes: 125,
    triangleCount: 2_000,
    materialCount: 3,
    auxiliaries: [],
    previews: [],
    errorCode: null,
    errorMessage: null,
  }
}

describe('useSceneAssetSources', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPost.mockImplementation(
      async (_url: string, body: { assets: SceneAssetRef[] }) => ({
        data: { resources: body.assets.map(resource) },
      })
    )
  })

  it('batches an initial scene and resolves only a newly added draft reference', async () => {
    // Regression: initial scene load fanned out per model, while replacing one candidate
    // under a single manifest query key redownloaded every unchanged resource. Drive both
    // document states through the real hook and React Query cache.
    const sofa = { assetType: 'Model', assetId: 4, versionId: 9 }
    const lamp = { assetType: 'Model', assetId: 5, versionId: 10 }
    const initial = documentWith([
      node('sofa-a', sofa),
      node('sofa-b', sofa),
      node('lamp', lamp),
    ])
    const queryClient = createTestQueryClient()
    const { result, rerender } = renderHook(
      ({ document }) => useSceneAssetSources(document),
      {
        initialProps: { document: initial },
        wrapper: createQueryWrapper(queryClient),
      }
    )

    await waitFor(() =>
      expect(result.current.get('Model:4:9')?.url).toBe(
        'http://localhost:8080/files/40'
      )
    )
    expect(result.current.get('Model:4:9')).toMatchObject({
      totalSizeBytes: 125,
      triangleCount: 2_000,
      materialCount: 3,
    })
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost.mock.calls[0][1].assets).toEqual([sofa, lamp])

    const chair = { assetType: 'Model', assetId: 6, versionId: 11 }
    act(() => {
      rerender({
        document: documentWith([...initial.nodes, node('chair', chair)]),
      })
    })

    await waitFor(() =>
      expect(result.current.get('Model:6:11')?.url).toBe(
        'http://localhost:8080/files/60'
      )
    )
    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(mockPost.mock.calls[1][1].assets).toEqual([chair])
  })

  it('keeps pending metadata as bounds but turns terminal states into failures', () => {
    // Regression: an errored manifest entry produced no source, so the first admitted node
    // stayed pending forever. Mutate pending, failure and successful-but-empty states to
    // prove only pending is allowed to keep waiting.
    expect(
      sceneSourceResolutionError(
        { isSuccess: false, isError: false },
        'missing renderable'
      )
    ).toBeNull()
    expect(
      sceneSourceResolutionError(
        { isError: true, error: new Error('metadata unavailable') },
        'missing renderable'
      )
    ).toBe('metadata unavailable')
    expect(
      sceneSourceResolutionError({ isSuccess: true }, 'missing renderable')
    ).toBe('missing renderable')
  })

  it('publishes a transport failure from the real query instead of staying pending', async () => {
    // React Query does not advance dataUpdatedAt for failures. The source-map memo must
    // therefore observe query status/error timestamps too, or an outage leaves bounds with
    // an indefinite loading marker and never releases resource admission.
    mockPost.mockRejectedValueOnce(new Error('manifest unavailable'))
    const sofa = { assetType: 'Model', assetId: 4, versionId: 9 }
    const queryClient = createTestQueryClient()
    const { result } = renderHook(
      () => useSceneAssetSources(documentWith([node('sofa', sofa)])),
      { wrapper: createQueryWrapper(queryClient) }
    )

    await waitFor(() =>
      expect(result.current.get('Model:4:9')).toMatchObject({
        isLoading: false,
        error: 'manifest unavailable',
      })
    )
  })
})
