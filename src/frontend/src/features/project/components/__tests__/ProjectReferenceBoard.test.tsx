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

/** Linked to nothing, so it must disappear the moment a filter is on. */
const dockReference: projectStudioApi.ProjectReferenceDto = {
  ...reference,
  id: 10,
  title: 'Harbor at dusk',
  fileId: 211,
  fileName: 'harbor.png',
  links: [],
  levelNames: [],
  characterNames: [],
}

/**
 * Routes the references the way the endpoint does: the option the component
 * sends decides the set, so a client-side filter over one flat list fails here.
 */
function mockReferencesByTarget() {
  queries.useProjectReferencesQuery.mockImplementation(
    (_projectId, options = {}) => {
      if (options.levelId === 3) return query([reference]) as never
      if (options.characterId === 4) return query([]) as never
      return query([reference, dockReference]) as never
    }
  )
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
    queries.useProjectCommentsQuery.mockReturnValue(
      query([
        {
          id: 5,
          projectId: 7,
          levelId: null,
          referenceImageId: 9,
          characterId: null,
          modelId: null,
          textureSetId: null,
          spriteId: null,
          soundId: null,
          environmentMapId: null,
          vfxId: null,
          title: 'Fog',
          body: 'Keep the horizon soft.',
          isPinned: false,
          status: 'open',
          resolution: null,
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

  it('shows every image with its level and character links and its comments', () => {
    renderBoard()

    expect(screen.getByText('Reference Board')).toBeVisible()
    expect(screen.getByLabelText('Title for forest.png')).toHaveValue(
      'Misty forest'
    )
    expect(screen.getByText('Forest Crossing')).toBeVisible()
    expect(screen.getByText('Keep the horizon soft.')).toBeVisible()
  })

  it('links an image to a character from a plus action and unlinks it again', async () => {
    const { queryClient } = renderBoard()
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries')

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

    // Linking a reference to a character changes that character's server-side
    // imageCount, so the characters query must be refreshed too - otherwise the
    // count stays stale until a reload.
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['projects', 7, 'characters'],
      })
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Unlink Forest Crossing' })
    )
    expect(api.removeProjectReferenceLink).toHaveBeenCalledWith(7, 9, 31)
  })

  it('adds a comment that targets the image', async () => {
    api.createProjectComment.mockResolvedValue({ id: 6 } as never)
    renderBoard()

    await userEvent.click(
      screen.getByRole('button', { name: 'Add comment to Misty forest' })
    )
    await userEvent.type(
      screen.getByLabelText('Comment title for Misty forest'),
      'Silhouettes'
    )
    await userEvent.type(
      screen.getByLabelText('Comment for Misty forest'),
      'Read the trees at a glance.'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(api.createProjectComment).toHaveBeenCalledWith(7, {
      referenceImageId: 9,
      title: 'Silhouettes',
      body: 'Read the trees at a glance.',
      isPinned: false,
    })
  })

  it('edits the comment under a reference image in place', async () => {
    api.updateProjectComment.mockResolvedValue({ id: 5 } as never)
    renderBoard()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Fog' }))
    const body = screen.getByLabelText('Edit comment')
    expect(body).toHaveValue('Keep the horizon soft.')
    await userEvent.clear(body)
    await userEvent.type(body, 'Keep the horizon unreadable.')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.updateProjectComment).toHaveBeenCalledWith(7, 5, {
        referenceImageId: 9,
        title: 'Fog',
        body: 'Keep the horizon unreadable.',
        isPinned: false,
      })
    )
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

  // "Show me this level's references" is the whole point of the link chips; a
  // filter that ignored the server options, or that counted the filtered set as
  // the total, would answer the question wrongly.
  it('filters the board to a level, keeps the link picker working, and resets', async () => {
    mockReferencesByTarget()
    renderBoard()

    const filter = screen.getByLabelText('Filter references by target')
    expect(screen.getByTestId('project-reference-count')).toHaveTextContent('2')
    expect(screen.getAllByTestId('project-reference-card')).toHaveLength(2)

    await userEvent.selectOptions(filter, 'level:3')

    await waitFor(() => {
      expect(screen.getAllByTestId('project-reference-card')).toHaveLength(1)
    })
    expect(screen.getByLabelText('Title for forest.png')).toBeVisible()
    expect(
      screen.queryByLabelText('Title for harbor.png')
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('project-reference-count')).toHaveTextContent(
      '1 of 2'
    )

    // The picker is driven by the full level/character lists, so adding a link
    // stays possible while a filter hides the rest of the board.
    await userEvent.click(
      screen.getByRole('button', { name: 'Link character' })
    )
    expect(
      await screen.findByRole('button', { name: 'Ashen Warden' })
    ).toBeVisible()

    await userEvent.selectOptions(filter, 'all')

    await waitFor(() => {
      expect(screen.getAllByTestId('project-reference-card')).toHaveLength(2)
    })
    expect(screen.getByTestId('project-reference-count')).toHaveTextContent('2')
  })

  it('shows an empty state rather than a placeholder row when nothing matches', async () => {
    mockReferencesByTarget()
    renderBoard()

    await userEvent.selectOptions(
      screen.getByLabelText('Filter references by target'),
      'character:4'
    )

    expect(
      await screen.findByText('No references linked here yet')
    ).toBeVisible()
    expect(screen.queryAllByTestId('project-reference-card')).toHaveLength(0)
  })
})
