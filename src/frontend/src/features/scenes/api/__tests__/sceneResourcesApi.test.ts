import { client } from '@/lib/apiBase'

import type { SceneAssetRef, SceneResource } from '../../types'
import {
  resolveSceneResources,
  SceneResourceRequestBatcher,
} from '../sceneResourcesApi'

const mockPost = client.post as jest.Mock

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
      sha256Hash: 'a'.repeat(64),
    },
    totalSizeBytes: 100,
    triangleCount: 1_000,
    materialCount: 2,
    auxiliaries: [],
    previews: [],
    errorCode: null,
    errorMessage: null,
  }
}

describe('sceneResourcesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('posts references as one manifest request and unwraps the response', async () => {
    // Regression: the old scene hook called the versions endpoint once per distinct model
    // and auxiliary endpoints afterward. The API boundary must preserve the batch body.
    const assets: SceneAssetRef[] = [
      { assetType: 'Model', assetId: 4, versionId: 9 },
      { assetType: 'Sprite', assetId: 7, versionId: null },
    ]
    const manifest = { resources: assets.map(resource) }
    mockPost.mockResolvedValue({ data: manifest })

    await expect(resolveSceneResources(assets)).resolves.toEqual(manifest)
    expect(mockPost).toHaveBeenCalledWith('/scenes/resources/resolve', {
      assets,
    })
  })

  it('propagates a manifest failure instead of converting it to missing files', async () => {
    // A transport/auth failure affects the whole batch and must stay retryable React Query
    // state; turning it into per-node "missing" errors would make a transient outage final.
    const failure = Object.assign(new Error('manifest unavailable'), {
      code: 'Network.Unavailable',
    })
    mockPost.mockRejectedValue(failure)

    await expect(resolveSceneResources([])).rejects.toMatchObject({
      code: 'Network.Unavailable',
    })
  })
})

describe('SceneResourceRequestBatcher', () => {
  it('coalesces same-tick misses but sends a later draft reference separately', async () => {
    // Regression: one batch cache key would refetch every unchanged asset when a choice
    // preview changed. Mutating the requested set after the first flush proves cache misses
    // remain per reference while initial misses still share one network call.
    const send = jest.fn(async (assets: SceneAssetRef[]) => ({
      resources: assets.map(resource),
    }))
    const batcher = new SceneResourceRequestBatcher(send)
    const sofa = { assetType: 'Model', assetId: 4, versionId: 9 }
    const lamp = { assetType: 'Model', assetId: 5, versionId: 10 }

    const [sofaA, sofaB, firstLamp] = await Promise.all([
      batcher.load(sofa),
      batcher.load(sofa),
      batcher.load(lamp),
    ])

    expect(sofaA).toEqual(resource(sofa))
    expect(sofaB).toEqual(resource(sofa))
    expect(firstLamp).toEqual(resource(lamp))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith([sofa, lamp])

    const chair = { assetType: 'Model', assetId: 6, versionId: 11 }
    await expect(batcher.load(chair)).resolves.toEqual(resource(chair))
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith([chair])
  })

  it('rejects a reference omitted by a malformed manifest', async () => {
    // A missing response entry used to leave the source pending indefinitely. An explicit
    // rejection makes React Query and the node error boundary release the scheduler.
    const batcher = new SceneResourceRequestBatcher(async () => ({
      resources: [],
    }))

    await expect(
      batcher.load({ assetType: 'Model', assetId: 4, versionId: 9 })
    ).rejects.toThrow('Model:4:9')
  })
})
