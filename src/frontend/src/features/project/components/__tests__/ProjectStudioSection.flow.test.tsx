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

const comment = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  projectId: 7,
  levelId: null,
  referenceImageId: null,
  characterId: null,
  modelId: null,
  textureSetId: null,
  spriteId: null,
  soundId: null,
  environmentMapId: null,
  vfxId: null,
  title: 'Bell tower mood',
  body: 'Cold, thin light.',
  isPinned: true,
  status: 'open',
  resolution: null,
  createdAt: '2026-09-25T00:00:00Z',
  updatedAt: '2026-09-25T00:00:00Z',
  ...overrides,
})

describe('ProjectStudioSection flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queries.useProjectLevelsQuery.mockReturnValue(
      query([{ id: 3, name: 'Forest Crossing' }]) as never
    )
    queries.useProjectCharactersQuery.mockReturnValue(query([]) as never)
    queries.useProjectCommentsQuery.mockReturnValue(query([]) as never)
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
    api.createProjectComment.mockResolvedValue({ id: 5 } as never)
    api.updateProjectComment.mockResolvedValue({ id: 11 } as never)
  })

  it('creates a level and a pinned project decision', async () => {
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
    await waitFor(() => expect(onChanged).toHaveBeenCalled())

    await userEvent.click(
      screen.getByRole('button', { name: 'Add comment to the project' })
    )
    await userEvent.type(
      screen.getByLabelText('Comment title for the project'),
      'Fog idea'
    )
    await userEvent.type(
      screen.getByLabelText('Comment for the project'),
      'Keep the horizon unreadable.'
    )
    await userEvent.click(screen.getByLabelText('Pin as decision'))
    await userEvent.click(screen.getByRole('button', { name: 'Add comment' }))

    // A project-wide comment carries no target field at all.
    await waitFor(() =>
      expect(api.createProjectComment).toHaveBeenCalledWith(7, {
        title: 'Fog idea',
        body: 'Keep the horizon unreadable.',
        isPinned: true,
      })
    )
  })

  // A comment that was create-only is the maintainer's exact complaint: the
  // body has to be correctable in place, and the save must not detach the
  // comment from the level it belongs to - nor change its status.
  it('edits a comment body in place and keeps its target and status', async () => {
    queries.useProjectCommentsQuery.mockReturnValue(
      query([comment({ levelId: 3 })]) as never
    )
    renderWithProviders(<ProjectStudioSection projectId={7} />, {
      tabId: 'project-7',
    })

    expect(screen.getByTestId('project-comment-row')).toHaveTextContent(
      'Level: Forest Crossing'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Bell tower mood' })
    )
    const body = screen.getByLabelText('Edit comment')
    expect(body).toHaveValue('Cold, thin light.')
    await userEvent.clear(body)
    await userEvent.type(body, 'Cold light, long shadows.')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.updateProjectComment).toHaveBeenCalledWith(7, 11, {
        levelId: 3,
        title: 'Bell tower mood',
        body: 'Cold light, long shadows.',
        isPinned: true,
      })
    )
  })

  // Resolving must send the status with the optional resolution, and the
  // target must ride along or the comment would fall off the level.
  it('resolves a comment with a resolution and reopens a resolved one', async () => {
    queries.useProjectCommentsQuery.mockReturnValue(
      query([
        comment({ levelId: 3 }),
        comment({
          id: 12,
          title: 'Fog density',
          isPinned: false,
          status: 'resolved',
          resolution: 'Halved the fog.',
        }),
      ]) as never
    )
    renderWithProviders(<ProjectStudioSection projectId={7} />, {
      tabId: 'project-7',
    })

    const rows = screen.getAllByTestId('project-comment-row')
    // Open first, resolved after it and visibly quieter.
    expect(rows.map(row => row.getAttribute('data-status'))).toEqual([
      'open',
      'resolved',
    ])
    expect(rows[1]).toHaveClass('is-resolved')
    expect(rows[1]).toHaveTextContent('Halved the fog.')
    expect(screen.getByTestId('project-comment-open-count')).toHaveTextContent(
      '1 open'
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Resolve Bell tower mood' })
    )
    await userEvent.type(
      screen.getByLabelText('Resolution for Bell tower mood'),
      'Moved the light source.'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    await waitFor(() =>
      expect(api.updateProjectComment).toHaveBeenCalledWith(7, 11, {
        levelId: 3,
        title: 'Bell tower mood',
        body: 'Cold, thin light.',
        isPinned: true,
        status: 'resolved',
        resolution: 'Moved the light source.',
      })
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Reopen Fog density' })
    )
    await waitFor(() =>
      expect(api.updateProjectComment).toHaveBeenCalledWith(7, 12, {
        title: 'Fog density',
        body: 'Cold, thin light.',
        isPinned: false,
        status: 'open',
        resolution: null,
      })
    )
  })
})
