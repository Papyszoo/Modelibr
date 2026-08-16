import { client } from '@/lib/apiBase'

import {
  createScene,
  getSceneById,
  getScenes,
  updateSceneDocument,
} from '../scenesApi'
import type { SceneDocument } from '../../types'

/**
 * Request construction for the scene endpoints.
 *
 * Regressions these catch: unwrapping `/scenes` as an array when the endpoint
 * returns `{ scenes: [...] }` (the list would silently render empty), and a
 * save that posts the document object instead of the JSON string the endpoint
 * reads - which the server rejects as an unreadable document, on every save.
 */

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock

const document: SceneDocument = {
  schemaVersion: 1,
  nodes: [],
  lights: [],
}

describe('scenesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('unwraps the scenes envelope', async () => {
    mockGet.mockResolvedValue({
      data: { scenes: [{ id: 1, name: 'Street' }] },
    })

    await expect(getScenes()).resolves.toEqual([{ id: 1, name: 'Street' }])
    expect(mockGet).toHaveBeenCalledWith('/scenes')
  })

  it('reads one scene by id', async () => {
    mockGet.mockResolvedValue({ data: { scene: { id: 4 } } })

    await getSceneById(4)

    expect(mockGet).toHaveBeenCalledWith('/scenes/4')
  })

  it('creates a scene from a name and description', async () => {
    mockPost.mockResolvedValue({ data: { scene: { id: 9 } } })

    await createScene({ name: 'Street', description: 'night' })

    expect(mockPost).toHaveBeenCalledWith('/scenes', {
      name: 'Street',
      description: 'night',
    })
  })

  it('sends the document as a JSON string with the expected revision', async () => {
    mockPut.mockResolvedValue({ data: { scene: { id: 2, revision: 5 } } })

    await updateSceneDocument(2, document, 4)

    expect(mockPut).toHaveBeenCalledWith('/scenes/2/document', {
      documentJson: JSON.stringify(document),
      expectedRevision: 4,
    })
  })

  it('omits the expected revision when none is given', async () => {
    mockPut.mockResolvedValue({ data: { scene: { id: 2, revision: 5 } } })

    await updateSceneDocument(2, document)

    expect(mockPut).toHaveBeenCalledWith('/scenes/2/document', {
      documentJson: JSON.stringify(document),
      expectedRevision: undefined,
    })
  })

  it('propagates a rejected document rather than swallowing it', async () => {
    // The whole point of the rewrite: an invalid document is an error the user
    // sees, not an empty scene and a toast.
    const failure = Object.assign(
      new Error('The scene document was rejected'),
      {
        code: 'Scene.DocumentInvalid',
      }
    )
    mockPut.mockRejectedValue(failure)

    await expect(updateSceneDocument(2, document, 1)).rejects.toMatchObject({
      code: 'Scene.DocumentInvalid',
    })
  })
})
