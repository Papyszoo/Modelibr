import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as projectStudioQueries from '@/features/project/api/projectStudioQueries'
import {
  createTab,
  getWindowId,
  useNavigationStore,
} from '@/stores/navigationStore'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectStudioSection } from '../ProjectStudioSection'

/**
 * The workspace's own navigation.
 *
 * The regressions here are the two ways a nested view strip goes wrong: it shows
 * everything at once (which is what it replaced), or it forgets the view the user
 * was on - a reload or a trip to another tab landing back on Overview is the same
 * class of loss the scene editor had with its open scene.
 */
jest.mock('@/features/project/api/projectStudioQueries')
jest.mock('@/features/project/api/projectStudioApi', () => ({
  ...jest.requireActual('@/features/project/api/projectStudioApi'),
  createProjectLevel: jest.fn(),
  createProductionNote: jest.fn(),
}))

const queries = projectStudioQueries as jest.Mocked<typeof projectStudioQueries>

function settled<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: jest.fn() }
}

/**
 * A real tab in a real window.
 *
 * The selected view is stored with `useTabUiState`, which writes into that tab's
 * persisted `internalUiState` - and the write is a no-op for a tab id the window
 * does not contain. Registering the tab is therefore part of the fixture, not an
 * optimisation: without it the strip renders and nothing it does sticks, which
 * would make every navigation assertion here pass or fail for the wrong reason.
 */
function registerTab(): string {
  const windowId = getWindowId()
  const tab = createTab('projectViewer', '7', 'Nightfall')
  useNavigationStore.setState({
    activeWindows: {
      [windowId]: {
        tabs: [tab],
        activeTabId: tab.id,
        activeRightTabId: null,
        splitterSize: 50,
        lastActiveAt: new Date().toISOString(),
      },
    },
    recentlyClosedTabs: [],
    recentlyClosedWindows: [],
  })
  return tab.id
}

beforeEach(() => {
  jest.clearAllMocks()
  queries.useProjectLevelsQuery.mockReturnValue(
    settled([
      {
        id: 3,
        projectId: 7,
        name: 'Forest Crossing',
        description: 'Fog and rope bridges',
        productionStatus: 'in_progress',
        sortOrder: 0,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ]) as never
  )
  queries.useProjectCharactersQuery.mockReturnValue(settled([]) as never)
  queries.useProductionNotesQuery.mockReturnValue(
    settled([
      {
        id: 11,
        projectId: 7,
        levelId: null,
        referenceImageId: null,
        characterId: null,
        title: 'Bell tower mood',
        body: 'Cold, thin light.',
        isPinned: true,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ]) as never
  )
  queries.useProjectReferencesQuery.mockReturnValue(
    settled([
      {
        id: 21,
        projectId: 7,
        title: 'Misty forest',
        fileId: 210,
        fileName: 'forest.png',
        previewUrl: '/files/210/preview',
        fileUrl: '/files/210',
        sortOrder: 0,
        links: [],
        levelNames: [],
        characterNames: [],
      },
    ]) as never
  )
  queries.useProjectMemberModelsQuery?.mockReturnValue(settled([]) as never)
})

describe('ProjectStudioSection workspace navigation', () => {
  it('opens on Overview and shows the level and the notes, not the whole studio', async () => {
    const tabId = registerTab()
    renderWithProviders(<ProjectStudioSection projectId={7} tabId={tabId} />)

    expect(
      screen.getByTestId('project-workspace-tab-overview')
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('project-level-row')).toBeVisible()
    expect(screen.getByTestId('project-note-row')).toBeVisible()
    // The other surfaces are one click away, not rendered underneath.
    expect(
      screen.queryByTestId('project-reference-board')
    ).not.toBeInTheDocument()
  })

  it('shows exactly one surface at a time', async () => {
    const tabId = registerTab()
    const user = userEvent.setup()
    renderWithProviders(<ProjectStudioSection projectId={7} tabId={tabId} />)

    await user.click(screen.getByTestId('project-workspace-tab-references'))

    await waitFor(() => {
      expect(screen.getByTestId('project-reference-board')).toBeVisible()
    })
    // The level list is not still sitting above the board.
    expect(screen.queryByTestId('project-level-row')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('project-workspace-tab-overview'))
    expect(await screen.findByTestId('project-level-row')).toBeVisible()
    expect(
      screen.queryByTestId('project-reference-board')
    ).not.toBeInTheDocument()
  })

  it('keeps the selected view in the tab state, so a reload returns to it', async () => {
    const tabId = registerTab()
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(
      <ProjectStudioSection projectId={7} tabId={tabId} />
    )

    await user.click(screen.getByTestId('project-workspace-tab-references'))
    await waitFor(() => {
      expect(screen.getByTestId('project-reference-board')).toBeVisible()
    })

    // Remounted from scratch, as a tab switch or a reload would: the view has to
    // come from the tab's persisted state rather than from component state.
    unmount()
    renderWithProviders(<ProjectStudioSection projectId={7} tabId={tabId} />)

    expect(
      screen.getByTestId('project-workspace-tab-references')
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('project-reference-board')).toBeVisible()
  })

  it("names a note's target instead of printing an id", async () => {
    const tabId = registerTab()
    queries.useProductionNotesQuery.mockReturnValue(
      settled([
        {
          id: 12,
          projectId: 7,
          levelId: 3,
          referenceImageId: null,
          characterId: null,
          title: 'Bell tower mood',
          body: 'Cold, thin light.',
          isPinned: false,
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      ]) as never
    )

    renderWithProviders(<ProjectStudioSection projectId={7} tabId={tabId} />)

    // "Level #3" is true and useless; the user has to recognise the level.
    expect(screen.getByText('Level: Forest Crossing')).toBeVisible()
  })
})
