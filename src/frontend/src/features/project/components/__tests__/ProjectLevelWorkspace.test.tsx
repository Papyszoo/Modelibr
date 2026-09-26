import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type JSX } from 'react'

import { TabContext, type TabContextValue } from '@/contexts/TabContext'
import { useScenesQuery } from '@/features/scenes/api/queries'
import {
  createTab,
  getWindowId,
  useNavigationStore,
} from '@/stores/navigationStore'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectLevelWorkspace } from '../ProjectLevelWorkspace'

/**
 * A Level in full.
 *
 * The regressions these guard are the two ways a drill-down loses a user: the
 * level's own four surfaces not replacing the project's (so the breadcrumb looks
 * decorative), and the shared sections being reimplemented per level instead of
 * scoped (so a level's assets could disagree with the project's view of them).
 */

jest.mock('@/features/scenes/api/queries', () => ({
  useScenesQuery: jest.fn(),
  // The level's own scene control is reused here rather than duplicated, so this
  // module's mutation hooks are part of rendering the workspace.
  useCreateSceneMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetSceneProjectMutation: () => ({ mutateAsync: jest.fn() }),
  useFileSceneUnderLevel: () => jest.fn(),
}))

jest.mock('../../api/projectStudioQueries', () => ({
  useProjectLevelsQuery: jest.fn(),
  useProjectMemberModelsQuery: jest.fn(() => ({ data: [] })),
  useProjectCharactersQuery: jest.fn(() => ({ data: [] })),
  useProductionNotesQuery: jest.fn(() => ({ data: [] })),
  useProjectReferencesQuery: jest.fn(() => ({ data: [] })),
  useUseCategoryMutations: jest.fn(() => ({})),
}))

const scenes = useScenesQuery as unknown as jest.Mock

const LEVEL = {
  id: 3,
  projectId: 7,
  name: 'Forest Crossing',
  description: 'The river crossing at dusk, with the bridge already collapsed.',
  productionStatus: 'in_progress',
  sortOrder: 2,
  characterVariantNames: ['Frozen', 'Ashen'],
  characterVariantCount: 2,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}

/**
 * Registers a real tab before rendering.
 *
 * `useTabUiState` is a no-op for a tab id the navigation store has never heard
 * of, so without this every "the selected surface is remembered" assertion would
 * pass for the wrong reason: the view would never change at all.
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
    selectedWindowId: windowId,
    recentlyClosedWindows: [],
  })
  return tab.id
}

let tabId = ''

function Harness({
  onExit = jest.fn(),
}: { onExit?: () => void } = {}): JSX.Element {
  const [tabs] = useState([
    {
      id: tabId,
      type: 'projectDetails' as const,
      label: 'Nightfall',
      params: { projectId: '7' },
      internalUiState: {},
    },
  ])
  const [activeTab] = useState(tabId)

  const value: TabContextValue = {
    side: 'left',
    tabs,
    setTabs: () => undefined,
    activeTab,
    setActiveTab: () => undefined,
    openModelDetailsTab: () => undefined,
    openTextureSetDetailsTab: () => undefined,
    openEnvironmentMapDetailsTab: () => undefined,
    openPackDetailsTab: () => undefined,
    openProjectDetailsTab: () => undefined,
    openScriptDetailsTab: () => undefined,
    openSceneEditorTab: jest.fn(),
    openScenesList: jest.fn(),
    relabelTab: jest.fn(),
    openTab: () => undefined,
    tabId: activeTab,
    closeTab: () => undefined,
  }

  return (
    <TabContext.Provider value={value}>
      <ProjectLevelWorkspace
        projectId={7}
        levelId={3}
        tabId={tabId}
        onExit={onExit}
      />
    </TabContext.Provider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  tabId = registerTab()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const queries = require('../../api/projectStudioQueries')
  queries.useProjectLevelsQuery.mockReturnValue({ data: [LEVEL] })
  scenes.mockReturnValue({
    data: [
      {
        id: 11,
        name: 'Crossing Layout',
        projectId: 7,
        projectLevelId: 3,
        isPrimaryLevelScene: true,
      },
      {
        id: 12,
        name: 'Crossing Alternate',
        projectId: 7,
        projectLevelId: 3,
        isPrimaryLevelScene: false,
      },
      {
        id: 13,
        name: 'Someone Elses Scene',
        projectId: 8,
        projectLevelId: 3,
        isPrimaryLevelScene: true,
      },
    ],
  })
})

describe('ProjectLevelWorkspace', () => {
  it('shows the level brief and a way back to the project', () => {
    renderWithProviders(<Harness />, { tabId })

    expect(screen.getByTestId('project-level-crumb-level')).toHaveTextContent(
      'Forest Crossing'
    )
    expect(screen.getByText(/bridge already collapsed/i)).toBeInTheDocument()
    // The variant count the API already returned, now actually shown.
    expect(screen.getByTestId('project-level-variant-count')).toHaveTextContent(
      '2'
    )
  })

  it('offers the level four surfaces, not the project four', () => {
    renderWithProviders(<Harness />, { tabId })

    const nav = screen.getByRole('tablist', { name: 'Level workspace' })
    expect(within(nav).getAllByRole('tab')).toHaveLength(4)
    expect(within(nav).getByRole('tab', { name: /Assets/ })).toBeInTheDocument()
    expect(within(nav).getByRole('tab', { name: /Scenes/ })).toBeInTheDocument()
    // Cast belongs to the project, not to a level.
    expect(within(nav).queryByRole('tab', { name: /Cast/ })).toBeNull()
  })

  it('returns to the project through the breadcrumb', async () => {
    const onExit = jest.fn()
    renderWithProviders(<Harness onExit={onExit} />, { tabId })

    await userEvent.click(screen.getByTestId('project-level-crumb-project'))

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('lists only this project’s scenes, marking the primary one', async () => {
    renderWithProviders(<Harness />, { tabId })

    await userEvent.click(screen.getByRole('tab', { name: /Scenes/ }))

    const rows = screen.getAllByTestId('project-level-scene-row')
    expect(rows).toHaveLength(2)
    // Another project's scene shares this level id; trusting the id alone would
    // list a scene from a different project.
    expect(screen.queryByText('Someone Elses Scene')).toBeNull()
    expect(rows[0]).toHaveAttribute('data-primary', 'true')
    expect(rows[0]).toHaveTextContent('primary')
  })

  it('says so when a level has no scene yet, instead of an empty list', async () => {
    scenes.mockReturnValue({ data: [] })
    renderWithProviders(<Harness />, { tabId })

    await userEvent.click(screen.getByRole('tab', { name: /Scenes/ }))

    expect(screen.getByText('No scene for this level yet')).toBeInTheDocument()
  })

  it('reports a level deleted while the workspace was open', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const queries = require('../../api/projectStudioQueries')
    queries.useProjectLevelsQuery.mockReturnValue({ data: [] })
    const onExit = jest.fn()
    renderWithProviders(<Harness onExit={onExit} />, { tabId })

    expect(screen.getByText('This level no longer exists')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Back to levels' })
    )
    expect(onExit).toHaveBeenCalled()
  })

  it('keeps the selected surface in the tab state', async () => {
    const { unmount } = renderWithProviders(<Harness />, { tabId })
    await userEvent.click(screen.getByRole('tab', { name: /Scenes/ }))
    expect(screen.getByTestId('project-level-scenes')).toBeInTheDocument()
    unmount()

    // Coming back to the same tab returns to the surface, not to the top: the
    // same complaint the scene editor and the project views already had.
    renderWithProviders(<Harness />, { tabId })
    await waitFor(() =>
      expect(screen.getByTestId('project-level-scenes')).toBeInTheDocument()
    )
  })
})
