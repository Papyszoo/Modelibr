import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as projectStudioApi from '@/features/project/api/projectStudioApi'
import * as projectStudioQueries from '@/features/project/api/projectStudioQueries'
import * as sceneQueries from '@/features/scenes/api/queries'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectStudioSection } from '../ProjectStudioSection'

jest.mock('@/features/project/api/projectStudioApi')
jest.mock('@/features/project/api/projectStudioQueries')
// Only the scene LIST is stubbed: the studio's level asset view reads scene
// documents through the editor's own query options, which stay real.
jest.mock('@/features/scenes/api/queries', () => ({
  ...jest.requireActual('@/features/scenes/api/queries'),
  useScenesQuery: jest.fn(),
}))

const api = projectStudioApi as jest.Mocked<typeof projectStudioApi>
const queries = projectStudioQueries as jest.Mocked<typeof projectStudioQueries>
const sceneQueriesMock = sceneQueries as jest.Mocked<typeof sceneQueries>

const query = <T,>(data: T) => ({
  data,
  error: null,
  isLoading: false,
  refetch: jest.fn(),
})

describe('ProjectStudioSection flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queries.useProjectLevelsQuery.mockReturnValue(
      query([{ id: 3, name: 'Forest Crossing' }]) as never
    )
    queries.useProjectCharactersQuery.mockReturnValue(query([]) as never)
    queries.useProductionNotesQuery.mockReturnValue(query([]) as never)
    // The level asset view's two reads: the project's explicit members and the
    // scene list. Both empty here - this flow is about creating a level.
    queries.useProjectMemberModelsQuery.mockReturnValue(query([]) as never)
    sceneQueriesMock.useScenesQuery.mockReturnValue(query([]) as never)
    queries.useProjectReferencesQuery.mockReturnValue(
      query([
        {
          id: 9,
          title: 'Misty forest',
          fileName: 'forest.png',
          links: [],
          levelNames: [],
          characterNames: [],
        },
      ]) as never
    )
    api.createProjectLevel.mockResolvedValue({ id: 4 } as never)
    api.createProductionNote.mockResolvedValue({ id: 5 } as never)
  })
  it('creates a level and a reference-targeted pinned idea', async () => {
    const onChanged = jest.fn()
    renderWithProviders(
      <ProjectStudioSection projectId={7} onChanged={onChanged} />,
      { tabId: 'project-7' }
    )

    // Scoped to the level row: the level asset view's picker carries the same
    // level name as an <option>, which is not the row under test.
    expect(screen.getByTestId('project-level-row')).toHaveTextContent(
      'Forest Crossing'
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add level' }))
    await userEvent.type(screen.getByLabelText('New level'), 'Ruined Keep')
    await userEvent.click(screen.getByRole('button', { name: 'Create level' }))
    await waitFor(() =>
      expect(api.createProjectLevel).toHaveBeenCalledWith(7, {
        name: 'Ruined Keep',
        productionStatus: 'planned',
      })
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await userEvent.type(screen.getByLabelText('New note or idea'), 'Fog idea')
    await userEvent.type(
      screen.getByLabelText('Note body'),
      'Keep the horizon unreadable.'
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Note target'),
      'reference:9'
    )
    await userEvent.click(screen.getByLabelText('Pin as idea'))
    await userEvent.click(screen.getByRole('button', { name: 'Create note' }))

    await waitFor(() =>
      expect(api.createProductionNote).toHaveBeenCalledWith(7, {
        title: 'Fog idea',
        body: 'Keep the horizon unreadable.',
        isPinned: true,
        referenceImageId: 9,
      })
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  // A production note that was create-only is the maintainer's exact complaint:
  // the body has to be correctable in place, and the save must not detach the
  // note from the level it belongs to.
  it('edits a note body in place and keeps its target', async () => {
    queries.useProductionNotesQuery.mockReturnValue(
      query([
        {
          id: 11,
          projectId: 7,
          levelId: 3,
          referenceImageId: null,
          characterId: null,
          title: 'Bell tower mood',
          body: 'Cold, thin light.',
          isPinned: true,
          createdAt: '2026-09-25T00:00:00Z',
          updatedAt: '2026-09-25T00:00:00Z',
        },
      ]) as never
    )
    api.updateProductionNote.mockResolvedValue({ id: 11 } as never)
    const onChanged = jest.fn()
    renderWithProviders(
      <ProjectStudioSection projectId={7} onChanged={onChanged} />,
      { tabId: 'project-7' }
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit note Bell tower mood' })
    )
    const body = screen.getByLabelText('Edit note body')
    expect(body).toHaveValue('Cold, thin light.')
    await userEvent.clear(body)
    await userEvent.type(body, 'Cold light, long shadows.')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save note changes' })
    )

    await waitFor(() =>
      expect(api.updateProductionNote).toHaveBeenCalledWith(7, 11, {
        levelId: 3,
        referenceImageId: null,
        characterId: null,
        title: 'Bell tower mood',
        body: 'Cold light, long shadows.',
        isPinned: true,
      })
    )
  })
})
