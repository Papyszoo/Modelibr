import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from 'primereact/confirmdialog'

import * as projectApi from '@/features/project/api/projectApi'
import * as projectStudioApi from '@/features/project/api/projectStudioApi'
import * as projectStudioQueries from '@/features/project/api/projectStudioQueries'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectReferenceBoard } from '../ProjectReferenceBoard'

jest.mock('@/features/project/api/projectStudioApi')
jest.mock('@/features/project/api/projectStudioQueries')
jest.mock('@/features/project/api/projectApi')
jest.mock('@/features/models/api/modelApi', () => ({
  uploadFile: jest.fn(),
}))

const api = projectStudioApi as jest.Mocked<typeof projectStudioApi>
const queries = projectStudioQueries as jest.Mocked<typeof projectStudioQueries>
const projectEndpoints = projectApi as jest.Mocked<typeof projectApi>

const query = <T,>(data: T) => ({
  data,
  error: null,
  isLoading: false,
  refetch: jest.fn(),
})

const reference: projectStudioApi.ProjectReferenceDto = {
  id: 9,
  projectId: 7,
  title: 'Misty forest',
  fileId: 210,
  fileName: 'forest.png',
  previewUrl: '/files/210/preview?channel=rgb',
  fileUrl: '/files/210',
  sortOrder: 0,
  links: [
    {
      id: 31,
      targetType: 'level',
      projectLevelId: 3,
      projectLevelName: 'Forest Crossing',
      projectCharacterId: null,
      projectCharacterName: null,
    },
  ],
  levelNames: ['Forest Crossing'],
  characterNames: [],
}

function renderBoard() {
  return renderWithProviders(
    <>
      <ConfirmDialog />
      <ProjectReferenceBoard projectId={7} />
    </>
  )
}

describe('ProjectReferenceBoard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queries.useProjectReferencesQuery.mockReturnValue(
      query([reference]) as never
    )
    queries.useProjectLevelsQuery.mockReturnValue(
      query([{ id: 3, name: 'Forest Crossing' }]) as never
    )
    queries.useProjectCharactersQuery.mockReturnValue(
      query([{ id: 4, name: 'Ashen Warden' }]) as never
    )
    queries.useProductionNotesQuery.mockReturnValue(
      query([
        {
          id: 5,
          projectId: 7,
          levelId: null,
          referenceImageId: 9,
          characterId: null,
          title: 'Fog',
          body: 'Keep the horizon soft.',
          isPinned: false,
          createdAt: '2026-09-25T00:00:00Z',
          updatedAt: '2026-09-25T00:00:00Z',
        },
      ]) as never
    )
    api.addProjectReferenceLink.mockResolvedValue({
      id: 32,
      targetType: 'character',
      projectLevelId: null,
      projectLevelName: null,
      projectCharacterId: 4,
      projectCharacterName: 'Ashen Warden',
    })
    api.removeProjectReferenceLink.mockResolvedValue(undefined)
  })

  it('shows every image with its level and character links and its notes', () => {
    renderBoard()

    expect(screen.getByText('Reference Board')).toBeVisible()
    expect(screen.getByLabelText('Title for forest.png')).toHaveValue(
      'Misty forest'
    )
    expect(screen.getByText('Forest Crossing')).toBeVisible()
    expect(screen.getByText('Keep the horizon soft.')).toBeVisible()
  })

  it('links an image to a character from a plus action and unlinks it again', async () => {
    renderBoard()

    await userEvent.click(
      screen.getByRole('button', { name: 'Link character' })
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ashen Warden' })
    )

    expect(api.addProjectReferenceLink).toHaveBeenCalledWith(7, 9, {
      projectLevelId: null,
      projectCharacterId: 4,
    })

    await userEvent.click(
      screen.getByRole('button', { name: 'Unlink Forest Crossing' })
    )
    expect(api.removeProjectReferenceLink).toHaveBeenCalledWith(7, 9, 31)
  })

  it('adds a note that targets the image', async () => {
    renderBoard()

    await userEvent.click(
      screen.getByRole('button', { name: 'Add note to forest.png' })
    )
    await userEvent.type(
      screen.getByLabelText('Note title for forest.png'),
      'Silhouettes'
    )
    await userEvent.type(
      screen.getByLabelText('Note body for forest.png'),
      'Read the trees at a glance.'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))

    expect(api.createProductionNote).toHaveBeenCalledWith(7, {
      referenceImageId: 9,
      title: 'Silhouettes',
      body: 'Read the trees at a glance.',
      isPinned: false,
    })
  })

  it('uploads then attaches a file to the project', async () => {
    const { uploadFile } = jest.requireMock('@/features/models/api/modelApi')
    uploadFile.mockResolvedValue({ fileId: 555, alreadyExists: false })
    projectEndpoints.addProjectConceptImage.mockResolvedValue(undefined)
    renderBoard()

    const input = screen.getByLabelText('Reference images to upload')
    const file = new File(['x'], 'new.png', { type: 'image/png' })
    await userEvent.upload(input, file)

    await waitFor(() => {
      expect(projectEndpoints.addProjectConceptImage).toHaveBeenCalledWith(
        7,
        555
      )
    })
  })
})
