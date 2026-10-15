import {
  commentTarget,
  commentTargetFields,
} from '@/features/project/commentTargets'
import { client } from '@/lib/apiBase'

import {
  addCharacterAbility,
  addProjectReferenceLink,
  createProjectCharacter,
  createProjectComment,
  createProjectLevel,
  getProjectCharacters,
  getProjectComments,
  getProjectReferences,
  removeProjectReferenceLink,
  updateCharacterVariant,
  updateProjectComment,
  updateProjectReference,
} from '../projectStudioApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock
const mockDelete = client.delete as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: [] })
  mockPost.mockResolvedValue({ data: { id: 1 } })
  mockPut.mockResolvedValue({ data: { id: 1 } })
  mockDelete.mockResolvedValue({ data: undefined })
})

describe('Project Studio API', () => {
  it('uses project-scoped level and comment routes', async () => {
    await createProjectLevel(7, { name: 'Forest Crossing' })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/levels', {
      name: 'Forest Crossing',
    })

    await createProjectComment(7, {
      title: 'Reference note',
      body: 'Keep the silhouettes soft.',
      isPinned: true,
    })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/comments', {
      title: 'Reference note',
      body: 'Keep the silhouettes soft.',
      isPinned: true,
    })
  })

  it('serializes comment filters and unwraps responses', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: 4 }] })
    await expect(
      getProjectComments(7, { levelId: 3, isPinned: true, status: 'open' })
    ).resolves.toEqual([{ id: 4 }])
    expect(mockGet).toHaveBeenCalledWith(
      '/projects/7/comments?levelId=3&isPinned=true&status=open'
    )

    mockGet.mockResolvedValueOnce({ data: [{ id: 9 }] })
    await getProjectReferences(7, { levelId: 3 })
    expect(mockGet).toHaveBeenCalledWith('/projects/7/references?levelId=3')

    mockGet.mockResolvedValueOnce({ data: [{ id: 11 }] })
    await getProjectReferences(7, { characterId: 4 })
    expect(mockGet).toHaveBeenCalledWith('/projects/7/references?characterId=4')
  })

  it('titles a reference and manages target links through the reference route', async () => {
    await updateProjectReference(7, 9, { title: 'Lighting reference' })
    expect(mockPut).toHaveBeenCalledWith('/projects/7/references/9', {
      title: 'Lighting reference',
    })

    await addProjectReferenceLink(7, 9, { projectLevelId: 3 })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/references/9/links', {
      projectLevelId: 3,
    })

    await addProjectReferenceLink(7, 9, { projectCharacterId: 4 })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/references/9/links', {
      projectCharacterId: 4,
    })

    await removeProjectReferenceLink(7, 9, 21)
    expect(mockDelete).toHaveBeenCalledWith('/projects/7/references/9/links/21')
  })

  it('uses project-scoped character routes for the cast and its children', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: 3 }] })
    await getProjectCharacters(7)
    expect(mockGet).toHaveBeenCalledWith('/projects/7/characters')

    await createProjectCharacter(7, {
      name: 'Ashen Warden',
      description: 'A firebound guardian.',
      tags: ['enemy', 'boss'],
    })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/characters', {
      name: 'Ashen Warden',
      description: 'A firebound guardian.',
      tags: ['enemy', 'boss'],
    })

    await addCharacterAbility(7, 3, { name: 'Ember lash' })
    expect(mockPost).toHaveBeenCalledWith(
      '/projects/7/characters/3/abilities',
      {
        name: 'Ember lash',
      }
    )

    await updateCharacterVariant(7, 3, 8, {
      name: 'Frozen',
      projectLevelId: 5,
    })
    expect(mockPut).toHaveBeenCalledWith(
      '/projects/7/characters/3/variants/8',
      { name: 'Frozen', projectLevelId: 5 }
    )
  })

  it('sends an asset target and a resolution through the comment routes', async () => {
    mockGet.mockResolvedValueOnce({ data: [] })
    await getProjectComments(7, { vfxId: 3 })
    expect(mockGet).toHaveBeenCalledWith('/projects/7/comments?vfxId=3')

    await createProjectComment(7, {
      ...commentTargetFields({ kind: 'modelId', id: 12 }),
      title: 'Scale',
      body: 'Twice too large.',
      isPinned: false,
    })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/comments', {
      modelId: 12,
      title: 'Scale',
      body: 'Twice too large.',
      isPinned: false,
    })

    await updateProjectComment(7, 5, {
      modelId: 12,
      title: 'Scale',
      body: 'Twice too large.',
      isPinned: false,
      status: 'resolved',
      resolution: 'Scaled to 0.5.',
    })
    expect(mockPut).toHaveBeenCalledWith('/projects/7/comments/5', {
      modelId: 12,
      title: 'Scale',
      body: 'Twice too large.',
      isPinned: false,
      status: 'resolved',
      resolution: 'Scaled to 0.5.',
    })
  })

  // A target read back from the wrong field would resend a comment's update
  // against the wrong thing - or detach it from its target entirely.
  it('reads a comment target from whichever id field is set', () => {
    const none = {
      levelId: null,
      referenceImageId: null,
      characterId: null,
      modelId: null,
      textureSetId: null,
      spriteId: null,
      soundId: null,
      environmentMapId: null,
      vfxId: null,
    }
    expect(commentTarget(none)).toBeNull()
    expect(commentTarget({ ...none, environmentMapId: 4 })).toEqual({
      kind: 'environmentMapId',
      id: 4,
    })
    expect(commentTargetFields(null)).toEqual({})
  })
})
