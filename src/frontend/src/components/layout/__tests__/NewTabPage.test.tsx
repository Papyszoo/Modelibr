import { fireEvent, render, screen } from '@testing-library/react'

import { NewTabPage } from '@/components/layout/NewTabPage'
import { DockContext } from '@/contexts/DockContext'
import { TabContext, type TabContextValue } from '@/contexts/TabContext'
import {
  type ClosedWindowEntry,
  getWindowId,
  useNavigationStore,
} from '@/stores/navigationStore'
import { type Tab } from '@/types'

function makeContextValue(
  overrides: Partial<TabContextValue> = {}
): TabContextValue {
  const noop = () => undefined
  return {
    side: 'left',
    tabs: [],
    setTabs: noop,
    activeTab: '',
    setActiveTab: noop,
    openModelDetailsTab: noop,
    openTextureSetDetailsTab: noop,
    openEnvironmentMapDetailsTab: noop,
    openPackDetailsTab: noop,
    openProjectDetailsTab: noop,
    openTab: noop,
    ...overrides,
  }
}

interface DockStub {
  recentlyClosedTabs?: Tab[]
  removeRecentlyClosedTab?: (id: string) => void
}

function renderWithContext(
  ui: React.ReactElement,
  contextValue: TabContextValue,
  dockStub: DockStub = {}
) {
  const noop = () => undefined
  const dockValue = {
    recentlyClosedTabs: dockStub.recentlyClosedTabs ?? [],
    addRecentlyClosedTab: noop,
    removeRecentlyClosedTab: dockStub.removeRecentlyClosedTab ?? noop,
    registerContextMenu: noop,
    unregisterContextMenu: noop,
    showContextMenu: noop,
  }

  return render(
    <DockContext.Provider value={dockValue}>
      <TabContext.Provider value={contextValue}>{ui}</TabContext.Provider>
    </DockContext.Provider>
  )
}

describe('NewTabPage', () => {
  const newTab: Tab = {
    id: 'newTab',
    type: 'newTab',
    label: 'New Tab',
    params: {},
    internalUiState: {},
  }

  it('renders all asset type tiles by default', () => {
    const ctx = makeContextValue({ tabs: [newTab], activeTab: 'newTab' })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx)

    expect(screen.getByText('Models')).toBeInTheDocument()
    expect(screen.getByText('Global Materials')).toBeInTheDocument()
    expect(screen.getByText('Model Textures')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()

    expect(screen.getByText('Asset Types')).toBeInTheDocument()
    expect(screen.getByText('Organize')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('filters tiles by search query', () => {
    const ctx = makeContextValue({ tabs: [newTab], activeTab: 'newTab' })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx)

    fireEvent.change(screen.getByLabelText('Search panels'), {
      target: { value: 'sound' },
    })

    expect(screen.getByText('Sounds')).toBeInTheDocument()
    expect(screen.queryByText('Models')).not.toBeInTheDocument()
    expect(screen.queryByText('Asset Types')).not.toBeInTheDocument()
  })

  it('replaces the host newTab with the picked type', () => {
    const setTabs = jest.fn()
    const setActiveTab = jest.fn()
    const ctx = makeContextValue({
      tabs: [newTab],
      activeTab: 'newTab',
      setTabs,
      setActiveTab,
    })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx)

    fireEvent.click(screen.getByText('Models'))

    expect(setTabs).toHaveBeenCalledTimes(1)
    const [updated] = setTabs.mock.calls[0]
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ type: 'modelList', label: 'Models' })
    expect(updated[0].id).not.toBe('newTab')
    expect(setActiveTab).toHaveBeenCalledWith(updated[0].id)
  })

  it('activates an existing singleton tab and drops the placeholder', () => {
    const existingModelList: Tab = {
      id: 'modelList',
      type: 'modelList',
      label: 'Models',
      params: {},
      internalUiState: {},
    }
    const setTabs = jest.fn()
    const setActiveTab = jest.fn()
    const ctx = makeContextValue({
      tabs: [existingModelList, newTab],
      activeTab: 'newTab',
      setTabs,
      setActiveTab,
    })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx)

    fireEvent.click(screen.getByText('Models'))

    expect(setTabs).toHaveBeenCalledWith([existingModelList])
    expect(setActiveTab).toHaveBeenCalledWith('modelList')
  })

  it('opens a dedicated globalMaterials tab when Global Materials is picked', () => {
    const setTabs = jest.fn()
    const setActiveTab = jest.fn()
    const ctx = makeContextValue({
      tabs: [newTab],
      activeTab: 'newTab',
      setTabs,
      setActiveTab,
    })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx)

    fireEvent.click(screen.getByText('Global Materials'))

    const [updated] = setTabs.mock.calls[0]
    expect(updated[0]).toMatchObject({
      type: 'globalMaterials',
      label: 'Global Materials',
    })
    expect(setActiveTab).toHaveBeenCalledWith(updated[0].id)
  })

  it('opens a dedicated modelTextures tab when Model Textures is picked', () => {
    const setTabs = jest.fn()
    const setActiveTab = jest.fn()
    const ctx = makeContextValue({
      tabs: [newTab],
      activeTab: 'newTab',
      setTabs,
      setActiveTab,
    })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx)

    fireEvent.click(screen.getByText('Model Textures'))

    const [updated] = setTabs.mock.calls[0]
    expect(updated[0]).toMatchObject({
      type: 'modelTextures',
      label: 'Model Textures',
    })
    expect(setActiveTab).toHaveBeenCalledWith(updated[0].id)
  })

  it('renders the Stages tile as disabled and does not open it on click', () => {
    const setTabs = jest.fn()
    const setActiveTab = jest.fn()
    const ctx = makeContextValue({
      tabs: [newTab],
      activeTab: 'newTab',
      setTabs,
      setActiveTab,
    })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx)

    const stagesTile = screen.getByText('Stages').closest('button')
    expect(stagesTile).toBeInTheDocument()
    expect(stagesTile).toBeDisabled()

    // `fireEvent.click` on a disabled button is a no-op in the DOM,
    // but we still want to ensure no tab mutation happens.
    fireEvent.click(stagesTile as HTMLElement)
    expect(setTabs).not.toHaveBeenCalled()
    expect(setActiveTab).not.toHaveBeenCalled()
  })

  it('preserves panel marker when converting in a right-panel tab', () => {
    const rightPanelNewTab: Tab = {
      ...newTab,
      id: 'newTab-right',
      params: { panel: 'right' },
    }
    const setTabs = jest.fn()
    const ctx = makeContextValue({
      side: 'right',
      tabs: [rightPanelNewTab],
      activeTab: 'newTab-right',
      setTabs,
    })
    renderWithContext(<NewTabPage tabId="newTab-right" />, ctx)

    fireEvent.click(screen.getByText('Sounds'))

    const [updated] = setTabs.mock.calls[0]
    expect(updated[0].params.panel).toBe('right')
    expect(updated[0].type).toBe('sounds')
  })

  // ── Recently Closed ──────────────────────────────────────────────────

  const closedProjects: Tab = {
    id: 'projects',
    type: 'projects',
    label: 'Projects',
    params: {},
    internalUiState: {},
  }

  it('hides the Recently Closed section when nothing is recent', () => {
    const ctx = makeContextValue({ tabs: [newTab], activeTab: 'newTab' })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx, {
      recentlyClosedTabs: [],
    })
    expect(screen.queryByText('Recently Closed')).not.toBeInTheDocument()
  })

  it('reopens a recently closed tab in place and removes it from the list', () => {
    const setTabs = jest.fn()
    const setActiveTab = jest.fn()
    const removeRecentlyClosedTab = jest.fn()
    const ctx = makeContextValue({
      tabs: [newTab],
      activeTab: 'newTab',
      setTabs,
      setActiveTab,
    })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx, {
      recentlyClosedTabs: [closedProjects],
      removeRecentlyClosedTab,
    })

    expect(screen.getByText('Recently Closed')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Reopen Projects'))

    const [updated] = setTabs.mock.calls[0]
    expect(updated[0]).toMatchObject({ id: 'projects', type: 'projects' })
    expect(setActiveTab).toHaveBeenCalledWith('projects')
    expect(removeRecentlyClosedTab).toHaveBeenCalledWith('projects')
  })

  it('dismiss button removes an entry without opening a tab', () => {
    const setTabs = jest.fn()
    const setActiveTab = jest.fn()
    const removeRecentlyClosedTab = jest.fn()
    const ctx = makeContextValue({
      tabs: [newTab],
      activeTab: 'newTab',
      setTabs,
      setActiveTab,
    })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx, {
      recentlyClosedTabs: [closedProjects],
      removeRecentlyClosedTab,
    })

    fireEvent.click(
      screen.getByLabelText('Remove Projects from recently closed')
    )

    expect(removeRecentlyClosedTab).toHaveBeenCalledWith('projects')
    expect(setTabs).not.toHaveBeenCalled()
    expect(setActiveTab).not.toHaveBeenCalled()
  })

  it('does not surface recently closed entries whose type is already open', () => {
    const existingProjects: Tab = { ...closedProjects, id: 'projects-active' }
    const ctx = makeContextValue({
      tabs: [existingProjects, newTab],
      activeTab: 'newTab',
    })
    renderWithContext(<NewTabPage tabId="newTab" />, ctx, {
      recentlyClosedTabs: [closedProjects],
    })

    // Section header should be absent because the only candidate is filtered out.
    expect(screen.queryByText('Recently Closed')).not.toBeInTheDocument()
  })

  // ── Sessions ─────────────────────────────────────────────────────────

  describe('Sessions section', () => {
    /** Build a closed-window entry with a fixed shape we can assert against. */
    function makeClosedWindow(
      tabs: Tab[],
      closedAt = '2026-05-17T10:00:00.000Z',
      windowId = `closed-${closedAt}`
    ): ClosedWindowEntry {
      return {
        closedAt,
        windowId,
        state: {
          tabs,
          activeTabId: tabs[0]?.id ?? null,
          activeRightTabId:
            tabs.find(t => t.params?.panel === 'right')?.id ?? null,
          splitterSize: 50,
          lastActiveAt: closedAt,
        },
      }
    }

    /** Reset the persisted store between assertions so leftover state from
     * the persist middleware doesn't bleed across tests. */
    beforeEach(() => {
      useNavigationStore.setState({
        activeWindows: {
          [getWindowId()]: {
            tabs: [
              {
                id: 'newTab',
                type: 'newTab',
                label: 'New Tab',
                params: {},
                internalUiState: {},
              },
            ],
            activeTabId: 'newTab',
            activeRightTabId: null,
            splitterSize: 50,
            lastActiveAt: new Date().toISOString(),
          },
        },
        recentlyClosedTabs: [],
        recentlyClosedWindows: [],
      })
    })

    const leftModels: Tab = {
      id: 'modelList',
      type: 'modelList',
      label: 'Models',
      params: {},
      internalUiState: {},
    }
    const leftSounds: Tab = {
      id: 'sounds',
      type: 'sounds',
      label: 'Sounds',
      params: {},
      internalUiState: {},
    }
    const rightSprites: Tab = {
      id: 'sprites',
      type: 'sprites',
      label: 'Sprites',
      params: { panel: 'right' },
      internalUiState: {},
    }

    it('renders one entry per archived window with left/right counts', () => {
      useNavigationStore.setState({
        recentlyClosedWindows: [
          makeClosedWindow([leftModels, leftSounds, rightSprites]),
        ],
      })
      const ctx = makeContextValue({ tabs: [newTab], activeTab: 'newTab' })
      renderWithContext(<NewTabPage tabId="newTab" />, ctx)

      expect(screen.getByText('Sessions')).toBeInTheDocument()

      const restoreBtn = screen.getByRole('button', {
        name: /Restore session — Left \(2\): Models, Sounds \| Right \(1\): Sprites/,
      })
      expect(restoreBtn).toBeInTheDocument()
    })

    it('restores tabs into the current window and drops the session entry', () => {
      useNavigationStore.setState({
        recentlyClosedWindows: [makeClosedWindow([leftModels, rightSprites])],
      })
      const setTabs = jest.fn()
      const ctx = makeContextValue({
        tabs: [newTab],
        activeTab: 'newTab',
        setTabs,
      })
      renderWithContext(<NewTabPage tabId="newTab" />, ctx)

      fireEvent.click(
        screen.getByRole('button', { name: /^Restore session — Left/ })
      )

      // Placeholder newTab removed from the panel.
      expect(setTabs).toHaveBeenCalledWith([])

      const state = useNavigationStore.getState()
      // Session entry consumed.
      expect(state.recentlyClosedWindows).toHaveLength(0)
      // Both tabs (left + right) merged into the current window.
      const merged = state.activeWindows[getWindowId()].tabs
      expect(merged.find(t => t.id === 'modelList')).toBeTruthy()
      expect(merged.find(t => t.id === 'sprites')?.params.panel).toBe('right')
    })

    it('dismiss button removes the entry without restoring tabs', () => {
      useNavigationStore.setState({
        recentlyClosedWindows: [makeClosedWindow([leftModels])],
      })
      const setTabs = jest.fn()
      const ctx = makeContextValue({
        tabs: [newTab],
        activeTab: 'newTab',
        setTabs,
      })
      renderWithContext(<NewTabPage tabId="newTab" />, ctx)

      fireEvent.click(screen.getByLabelText('Remove session from list'))

      expect(useNavigationStore.getState().recentlyClosedWindows).toHaveLength(
        0
      )
      // The placeholder newTab is untouched by dismiss.
      expect(setTabs).not.toHaveBeenCalled()
      // No tabs added to the current window.
      const tabs =
        useNavigationStore.getState().activeWindows[getWindowId()].tabs
      expect(tabs.find(t => t.id === 'modelList')).toBeFalsy()
    })

    it('hides the section when there are no sessions', () => {
      useNavigationStore.setState({ recentlyClosedWindows: [] })
      const ctx = makeContextValue({ tabs: [newTab], activeTab: 'newTab' })
      renderWithContext(<NewTabPage tabId="newTab" />, ctx)

      expect(screen.queryByText('Sessions')).not.toBeInTheDocument()
    })
  })
})
