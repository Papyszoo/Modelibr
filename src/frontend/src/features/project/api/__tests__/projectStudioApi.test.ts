import { client } from '@/lib/apiBase'

import {
  addCharacterAbility,
  addProjectReferenceLink,
  createProductionNote,
  createProjectCharacter,
  createProjectLevel,
  getProductionNotes,
  getProjectCharacters,
  getProjectReferences,
  removeProjectReferenceLink,
  updateCharacterVariant,
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
  it('uses project-scoped level and production-note routes', async () => {
    await createProjectLevel(7, { name: 'Forest Crossing' })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/levels', {
      name: 'Forest Crossing',
    })

    await createProductionNote(7, {
      title: 'Reference note',
      body: 'Keep the silhouettes soft.',
      isPinned: true,
    })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/production-notes', {
      title: 'Reference note',
      body: 'Keep the silhouettes soft.',
      isPinned: true,
    })
  })

  it('serializes production filters and unwraps responses', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: 4 }] })
    await getProductionNotes(7, { levelId: 3, isPinned: true })
    expect(mockGet).toHaveBeenCalledWith(
      '/projects/7/production-notes?levelId=3&isPinned=true'
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

  it('sends the character note target in production-note routes', async () => {
    mockGet.mockResolvedValueOnce({ data: [] })
    await getProductionNotes(7, { characterId: 3 })
    expect(mockGet).toHaveBeenCalledWith(
      '/projects/7/production-notes?characterId=3'
    )

    await createProductionNote(7, {
      characterId: 3,
      title: 'Weakness',
      body: 'Quenches under water.',
      isPinned: false,
    })
    expect(mockPost).toHaveBeenCalledWith('/projects/7/production-notes', {
      characterId: 3,
      title: 'Weakness',
      body: 'Quenches under water.',
      isPinned: false,
    })
  })
})
