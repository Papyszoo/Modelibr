import { client } from '@/lib/apiBase'

import {
  addEnvironmentMapToPack,
  addModelToPack,
  addScriptToPack,
  addSoundToPack,
  addSpriteToPack,
  addTextureSetToPack,
  getModelsByPack,
  getScriptsByPack,
  getSoundsByPack,
  removeModelFromPack,
  removeScriptFromPack,
} from '../packApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockDelete = client.delete as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockPost.mockResolvedValue({ data: {} })
  mockDelete.mockResolvedValue({ data: {} })
})

describe('pack membership endpoints', () => {
  // Each asset type hangs off the pack under its own sub-resource; the id pair
  // ordering (packId then assetId) is the contract every "Add to pack" button
  // depends on. These lock the exact method + URL.
  it('adds members via POST /packs/{packId}/{type}/{id}', async () => {
    await addModelToPack(3, 70)
    expect(mockPost).toHaveBeenCalledWith('/packs/3/models/70')

    await addTextureSetToPack(3, 71)
    expect(mockPost).toHaveBeenCalledWith('/packs/3/texture-sets/71')

    await addSpriteToPack(3, 72)
    expect(mockPost).toHaveBeenCalledWith('/packs/3/sprites/72')

    await addSoundToPack(3, 73)
    expect(mockPost).toHaveBeenCalledWith('/packs/3/sounds/73')

    await addScriptToPack(3, 74)
    expect(mockPost).toHaveBeenCalledWith('/packs/3/scripts/74')

    await addEnvironmentMapToPack(3, 75)
    expect(mockPost).toHaveBeenCalledWith('/packs/3/environment-maps/75')
  })

  it('removes members via DELETE on the same sub-resource', async () => {
    await removeModelFromPack(3, 70)
    expect(mockDelete).toHaveBeenCalledWith('/packs/3/models/70')

    await removeScriptFromPack(3, 74)
    expect(mockDelete).toHaveBeenCalledWith('/packs/3/scripts/74')
  })
})

describe('pack-scoped listing', () => {
  // Regression class: these must pass `packIds=<id>` so the server returns only
  // the pack's members. A dropped filter shows the *entire* library inside one
  // pack (the bug we hit when a new pack appeared to contain every script).
  it('scopes each asset list by packIds and unwraps the response', async () => {
    mockGet.mockResolvedValue({ data: { scripts: [{ id: 1 }] } })
    const scripts = await getScriptsByPack(3)
    expect(mockGet).toHaveBeenCalledWith('/scripts?packIds=3')
    expect(scripts).toEqual([{ id: 1 }])

    mockGet.mockResolvedValue({ data: { sounds: [{ id: 2 }] } })
    await getSoundsByPack(3)
    expect(mockGet).toHaveBeenCalledWith('/sounds?packIds=3')

    mockGet.mockResolvedValue({ data: [{ id: 3 }] })
    await getModelsByPack(3)
    expect(mockGet).toHaveBeenCalledWith('/models?packIds=3')
  })
})
