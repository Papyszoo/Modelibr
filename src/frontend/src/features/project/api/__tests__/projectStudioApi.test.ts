import { client } from '@/lib/apiBase'

import {
  createProductionNote,
  createProjectLevel,
  getProductionNotes,
  getProjectReferences,
  updateProjectReference,
} from '../projectStudioApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: [] })
  mockPost.mockResolvedValue({ data: { id: 1 } })
  mockPut.mockResolvedValue({ data: { id: 1 } })
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
    await getProjectReferences(7, 3)
    expect(mockGet).toHaveBeenCalledWith('/projects/7/references?levelId=3')
  })

  it('updates a reference association without using the file id as the route id', async () => {
    await updateProjectReference(7, 9, {
      title: 'Lighting reference',
      projectLevelId: 3,
    })
    expect(mockPut).toHaveBeenCalledWith('/projects/7/references/9', {
      title: 'Lighting reference',
      projectLevelId: 3,
    })
  })
})
