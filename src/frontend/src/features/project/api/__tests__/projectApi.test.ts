import { client } from '@/lib/apiBase'

import {
  addEnvironmentMapToProject,
  addModelToProject,
  addScriptToProject,
  addSoundToProject,
  addSpriteToProject,
  addTextureSetToProject,
  getModelsByProject,
  getScriptsByProject,
  removeModelFromProject,
  removeScriptFromProject,
} from '../projectApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockDelete = client.delete as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockPost.mockResolvedValue({ data: {} })
  mockDelete.mockResolvedValue({ data: {} })
})

describe('project membership endpoints', () => {
  it('adds members via POST /projects/{projectId}/{type}/{id}', async () => {
    await addModelToProject(5, 70)
    expect(mockPost).toHaveBeenCalledWith('/projects/5/models/70')

    await addTextureSetToProject(5, 71)
    expect(mockPost).toHaveBeenCalledWith('/projects/5/texture-sets/71')

    await addSpriteToProject(5, 72)
    expect(mockPost).toHaveBeenCalledWith('/projects/5/sprites/72')

    await addSoundToProject(5, 73)
    expect(mockPost).toHaveBeenCalledWith('/projects/5/sounds/73')

    await addScriptToProject(5, 74)
    expect(mockPost).toHaveBeenCalledWith('/projects/5/scripts/74')

    await addEnvironmentMapToProject(5, 75)
    expect(mockPost).toHaveBeenCalledWith('/projects/5/environment-maps/75')
  })

  it('removes members via DELETE on the same sub-resource', async () => {
    await removeModelFromProject(5, 70)
    expect(mockDelete).toHaveBeenCalledWith('/projects/5/models/70')

    await removeScriptFromProject(5, 74)
    expect(mockDelete).toHaveBeenCalledWith('/projects/5/scripts/74')
  })
})

describe('project-scoped listing', () => {
  // Same silent-filter-drop regression class as packs: scope by projectIds or a
  // project shows the entire library.
  it('scopes lists by projectIds and unwraps the response', async () => {
    mockGet.mockResolvedValue({ data: { scripts: [{ id: 1 }] } })
    const scripts = await getScriptsByProject(5)
    expect(mockGet).toHaveBeenCalledWith('/scripts?projectIds=5')
    expect(scripts).toEqual([{ id: 1 }])

    mockGet.mockResolvedValue({ data: [{ id: 2 }] })
    await getModelsByProject(5)
    expect(mockGet).toHaveBeenCalledWith('/models?projectIds=5')
  })
})
