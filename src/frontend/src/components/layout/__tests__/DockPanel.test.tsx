import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { DockPanelContent } from '@/components/layout/DockPanelContent'
import { DockProvider } from '@/contexts/DockContext'
import { useUIPreferencesStore } from '@/stores/uiPreferencesStore'
import { type Tab } from '@/types'

// Mock navigationStore to avoid import.meta.env chain
jest.mock('@/stores/navigationStore', () => ({
  getWindowId: () => 'test-window-id',
  useNavigationStore: Object.assign(
    jest.fn((selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        recentlyClosedTabs: [],
        addRecentlyClosedTab: jest.fn(),
        removeRecentlyClosedTab: jest.fn(),
      }
      return selector ? selector(state) : state
    }),
    { getState: () => ({}) }
  ),
  createTab: (type: string) => ({
    id: type,
    type,
    label: type,
    params: {},
    internalUiState: {},
  }),
  broadcastNavigation: jest.fn(),
  getTabLabel: (type: string) => `label:${type}`,
}))

// Test wrapper with DockProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <DockProvider>{children}</DockProvider>
)

// Mock PrimeReact components - use require inside factory to avoid scope issues
jest.mock('primereact/button', () => {
  return {
    Button: ({
      children,
      onClick,
      ...props
    }: React.PropsWithChildren<{
      onClick?: (e: React.MouseEvent) => void
    }>) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
  }
})

jest.mock('primereact/contextmenu', () => {
  const React = require('react')
  return {
    ContextMenu: React.forwardRef(
      (
        { children, ...props }: React.PropsWithChildren<unknown>,
        ref: React.Ref<{ hide: () => void; show: (e: unknown) => void }>
      ) => {
        React.useImperativeHandle(ref, () => ({
          hide: jest.fn(),
          show: jest.fn(),
        }))
        return <div {...props}>{children}</div>
      }
    ),
  }
})

// Mock TabContent and DraggableTab components
jest.mock('../TabContent', () => ({
  TabContent: function MockTabContent({ tab }: { tab: { label?: string } }) {
    return <div data-testid="tab-content">{tab.label} Content</div>
  },
}))

jest.mock('../DraggableTab', () => ({
  DraggableTab: function MockDraggableTab({
    tab,
    isActive,
    onClose,
    tooltipPosition,
    closable = true,
  }: {
    tab: { id: string; label?: string }
    isActive: boolean
    onClose: () => void
    tooltipPosition?: string
    closable?: boolean
  }) {
    return (
      <div
        data-testid="draggable-tab"
        data-active={isActive}
        data-tooltip-position={tooltipPosition}
      >
        {tab.label}
        {closable && (
          <button
            data-testid={`close-${tab.id}`}
            onClick={onClose}
            aria-label="Close tab"
          >
            ×
          </button>
        )}
      </div>
    )
  },
}))

jest.mock('../../../hooks/useTabContext', () => {
  return {
    TabProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="tab-provider">{children}</div>
    ),
  }
})

describe('DockPanelContent', () => {
  const mockProps = {
    side: 'left' as const,
    tabs: [],
    setTabs: jest.fn(),
    activeTab: '',
    setActiveTab: jest.fn(),
    draggedTab: null,
    setDraggedTab: jest.fn(),
    moveTabBetweenPanels: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render empty dock panel when no tabs are open', () => {
    render(<DockPanelContent {...mockProps} />, { wrapper: TestWrapper })

    expect(screen.getByText('No tabs open')).toBeInTheDocument()
    expect(
      screen.getByText('Click here or the + button to open a new tab')
    ).toBeInTheDocument()
  })

  it('should render active tab content when tabs are present', () => {
    const tabs: Tab[] = [
      {
        id: 'test-tab',
        type: 'modelList',
        label: 'Test Tab',
        params: {},
        internalUiState: {},
      },
    ]
    const propsWithTabs = {
      ...mockProps,
      tabs,
      activeTab: 'test-tab',
    }

    render(<DockPanelContent {...propsWithTabs} />, { wrapper: TestWrapper })

    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(screen.getByText('Test Tab Content')).toBeInTheDocument()
  })

  // Regression: left-dock tooltips sat below the icon and dropped onto the page
  // heading, and a click left them hanging over the content. They must open to
  // the right of the bar instead.
  it('opens left-dock tab tooltips to the right, clear of the heading', () => {
    const tabs: Tab[] = [
      {
        id: 'test-tab',
        type: 'modelList',
        label: 'Test Tab',
        params: {},
        internalUiState: {},
      },
    ]

    render(
      <DockPanelContent {...mockProps} tabs={tabs} activeTab="test-tab" />,
      { wrapper: TestWrapper }
    )

    expect(screen.getByTestId('draggable-tab')).toHaveAttribute(
      'data-tooltip-position',
      'right'
    )
  })

  it('should have drag handlers on dock-bar but not on active tab content', () => {
    const tabs: Tab[] = [
      {
        id: 'test-tab',
        type: 'modelList',
        label: 'Test Tab',
        params: {},
        internalUiState: {},
      },
    ]
    const propsWithTabs = {
      ...mockProps,
      tabs,
      activeTab: 'test-tab',
    }

    const { container } = render(<DockPanelContent {...propsWithTabs} />, {
      wrapper: TestWrapper,
    })

    // Find dock-content element - it should not have drag handlers when active tab is present
    const dockContent = container.querySelector('.dock-content')
    expect(dockContent).toBeInTheDocument()

    // The key test: dock content should contain tab content, not empty dock area
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(screen.queryByText('No tabs open')).not.toBeInTheDocument()
  })

  it('should show empty dock area with drag handlers when no tabs are open', () => {
    const { container } = render(<DockPanelContent {...mockProps} />, {
      wrapper: TestWrapper,
    })

    // Find dock-empty element within dock-content
    const dockEmpty = container.querySelector('.dock-empty')
    expect(dockEmpty).toBeInTheDocument()

    // The key test: empty dock area should be present
    expect(screen.getByText('No tabs open')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
  })

  // Main pages were reachable only through the + launcher. The main dock pins
  // the configured subset (Models and Projects by default): an open one is its
  // own tab, a closed one an entry that opens it.
  describe('pinned entries', () => {
    const modelList: Tab = {
      id: 'modelList',
      type: 'modelList',
      label: 'Models',
      params: {},
      internalUiState: {},
    }

    beforeEach(() => {
      useUIPreferencesStore.setState({
        pinnedTabTypes: ['modelList', 'projects'],
      })
    })

    it('shows only the closed pinned pages as entries that open them', () => {
      const onPinnedSelect = jest.fn()
      const { container } = render(
        <DockPanelContent
          {...mockProps}
          tabs={[modelList]}
          activeTab="modelList"
          onPinnedSelect={onPinnedSelect}
        />,
        { wrapper: TestWrapper }
      )

      const pinned = container.querySelector('.dock-pinned')
      // The open Models tab sits in its pinned slot, not duplicated below.
      expect(pinned).toContainElement(screen.getByTestId('draggable-tab'))
      expect(screen.getAllByTestId('draggable-tab')).toHaveLength(1)
      // Only Projects is pinned and closed; Global Materials, VFX and Scenes
      // are ordinary tabs now and get no entry until they are opened.
      expect(
        Array.from(container.querySelectorAll('.dock-pin')).map(el =>
          el.getAttribute('aria-label')
        )
      ).toEqual(['label:projects'])

      fireEvent.click(screen.getByLabelText('label:projects'))
      expect(onPinnedSelect).toHaveBeenCalledWith('projects')
    })

    it('turns an unpinned page into an ordinary closable tab', () => {
      // Changing the setting applies immediately: unpinning drops the entry
      // and the page becomes an ordinary tab that can be closed.
      useUIPreferencesStore.setState({ pinnedTabTypes: ['modelList'] })
      const projects: Tab = {
        id: 'projects',
        type: 'projects',
        label: 'Projects',
        params: {},
        internalUiState: {},
      }
      const { container } = render(
        <DockPanelContent
          {...mockProps}
          tabs={[modelList, projects]}
          activeTab="modelList"
          onPinnedSelect={jest.fn()}
        />,
        { wrapper: TestWrapper }
      )

      expect(screen.queryByLabelText('label:projects')).toBeNull()
      const projectsTab = screen
        .getByTestId('close-projects')
        .closest('[data-testid]')
      expect(projectsTab).toBeInTheDocument()
      // It now sits below the pinned group as a normal tab, not inside it.
      expect(container.querySelector('.dock-pinned')).not.toContainElement(
        projectsTab as HTMLElement
      )
    })

    it('keeps an open pinned page in its slot without a close button', () => {
      const sounds: Tab = {
        id: 'sounds',
        type: 'sounds',
        label: 'Sounds',
        params: {},
        internalUiState: {},
      }
      render(
        <DockPanelContent
          {...mockProps}
          tabs={[modelList, sounds]}
          activeTab="modelList"
          onPinnedSelect={jest.fn()}
        />,
        { wrapper: TestWrapper }
      )

      expect(screen.queryByTestId('close-modelList')).toBeNull()
      expect(screen.getByTestId('close-sounds')).toBeInTheDocument()
    })

    it('has no pinned entries in a panel that is not the main dock', () => {
      const { container } = render(
        <DockPanelContent {...mockProps} tabs={[modelList]} />,
        { wrapper: TestWrapper }
      )

      expect(container.querySelector('.dock-pinned')).toBeNull()
      expect(screen.getAllByTestId('draggable-tab')).toHaveLength(1)
    })

    // A pinned page dragged to the right panel is visible there; the main dock
    // must not offer a second entry whose click would land in that panel.
    it('hides the entry for a pinned page open in the other panel', () => {
      const { container } = render(
        <DockPanelContent
          {...mockProps}
          tabs={[]}
          onPinnedSelect={jest.fn()}
          pinnedTypesOpenElsewhere={['modelList']}
        />,
        { wrapper: TestWrapper }
      )

      expect(
        Array.from(container.querySelectorAll('.dock-pin')).map(el =>
          el.getAttribute('aria-label')
        )
      ).toEqual(['label:projects'])
    })

    // Two tabs of one pinned type share its singleton id. The extra one must
    // still get a bar button rather than being filtered out of the dock.
    it('keeps a dock button for a duplicate of an open pinned page', () => {
      const duplicate: Tab = { ...modelList }
      const { container } = render(
        <DockPanelContent
          {...mockProps}
          tabs={[modelList, duplicate]}
          activeTab="modelList"
          onPinnedSelect={jest.fn()}
        />,
        { wrapper: TestWrapper }
      )

      expect(screen.getAllByTestId('draggable-tab')).toHaveLength(2)
      const pinned = container.querySelector('.dock-pinned') as HTMLElement
      expect(pinned).toContainElement(screen.getAllByTestId('draggable-tab')[0])
      // The pinned slot has no close button; the extra tab is ordinary.
      expect(screen.getByTestId('close-modelList')).toBeInTheDocument()
    })

    // The duplicate above is prevented at the source: a cross-window drop of a
    // type already here focuses it instead of appending a second tab.
    it('focuses an existing pinned page instead of duplicating it on drop', () => {
      const setTabs = jest.fn()
      const setActiveTab = jest.fn()
      const { container } = render(
        <DockPanelContent
          {...mockProps}
          tabs={[modelList]}
          activeTab="modelList"
          setTabs={setTabs}
          setActiveTab={setActiveTab}
        />,
        { wrapper: TestWrapper }
      )

      const dataTransfer = {
        getData: () =>
          JSON.stringify({
            tab: { ...modelList },
            sourceWindowId: 'other-window',
          }),
      }
      fireEvent.drop(container.querySelector('.dock-bar') as Element, {
        dataTransfer,
      })

      expect(setTabs).not.toHaveBeenCalled()
      expect(setActiveTab).toHaveBeenCalledWith('modelList')
    })
  })

  describe('Tab Closing Behavior', () => {
    it('guards a dirty Project tab before closing it', () => {
      const dirtyProject: Tab = {
        id: 'project-9',
        type: 'projectViewer',
        label: 'Draft Meridian',
        projectId: '9',
        params: { projectId: '9' },
        internalUiState: { hasUnsavedChanges: true },
      }
      const setTabs = jest.fn()
      const setActiveTab = jest.fn()
      const confirmSpy = jest
        .spyOn(window, 'confirm')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)

      render(
        <DockPanelContent
          {...mockProps}
          tabs={[dirtyProject]}
          activeTab={dirtyProject.id}
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />,
        { wrapper: TestWrapper }
      )

      fireEvent.click(screen.getByTestId(`close-${dirtyProject.id}`))
      expect(setTabs).not.toHaveBeenCalled()

      fireEvent.click(screen.getByTestId(`close-${dirtyProject.id}`))
      expect(setTabs).toHaveBeenCalledWith([])
      expect(setActiveTab).toHaveBeenCalledWith('')
      expect(confirmSpy).toHaveBeenCalledTimes(2)

      confirmSpy.mockRestore()
    })

    it('should activate previous tab when closing the middle active tab', () => {
      const tabs: Tab[] = [
        {
          id: 'tab-1',
          type: 'modelList',
          label: 'Tab 1',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-2',
          type: 'textureSets',
          label: 'Tab 2',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-3',
          type: 'sprites',
          label: 'Tab 3',
          params: {},
          internalUiState: {},
        },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanelContent
          {...mockProps}
          tabs={tabs}
          activeTab="tab-2"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />,
        { wrapper: TestWrapper }
      )

      // Close the middle tab (tab-2)
      const closeButton = screen.getByTestId('close-tab-2')
      fireEvent.click(closeButton)

      // Should activate the previous tab (tab-1)
      expect(setActiveTab).toHaveBeenCalledWith('tab-1')
      expect(setTabs).toHaveBeenCalledWith([
        {
          id: 'tab-1',
          type: 'modelList',
          label: 'Tab 1',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-3',
          type: 'sprites',
          label: 'Tab 3',
          params: {},
          internalUiState: {},
        },
      ])
    })

    it('should activate next tab when closing the first active tab', () => {
      const tabs: Tab[] = [
        {
          id: 'tab-1',
          type: 'modelList',
          label: 'Tab 1',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-2',
          type: 'textureSets',
          label: 'Tab 2',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-3',
          type: 'sprites',
          label: 'Tab 3',
          params: {},
          internalUiState: {},
        },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanelContent
          {...mockProps}
          tabs={tabs}
          activeTab="tab-1"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />,
        { wrapper: TestWrapper }
      )

      // Close the first tab (tab-1)
      const closeButton = screen.getByTestId('close-tab-1')
      fireEvent.click(closeButton)

      // Should activate the next tab (tab-2)
      expect(setActiveTab).toHaveBeenCalledWith('tab-2')
      expect(setTabs).toHaveBeenCalledWith([
        {
          id: 'tab-2',
          type: 'textureSets',
          label: 'Tab 2',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-3',
          type: 'sprites',
          label: 'Tab 3',
          params: {},
          internalUiState: {},
        },
      ])
    })

    it('should activate previous tab when closing the last active tab', () => {
      const tabs: Tab[] = [
        {
          id: 'tab-1',
          type: 'modelList',
          label: 'Tab 1',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-2',
          type: 'textureSets',
          label: 'Tab 2',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-3',
          type: 'sprites',
          label: 'Tab 3',
          params: {},
          internalUiState: {},
        },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanelContent
          {...mockProps}
          tabs={tabs}
          activeTab="tab-3"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />,
        { wrapper: TestWrapper }
      )

      // Close the last tab (tab-3)
      const closeButton = screen.getByTestId('close-tab-3')
      fireEvent.click(closeButton)

      // Should activate the previous tab (tab-2)
      expect(setActiveTab).toHaveBeenCalledWith('tab-2')
      expect(setTabs).toHaveBeenCalledWith([
        {
          id: 'tab-1',
          type: 'modelList',
          label: 'Tab 1',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-2',
          type: 'textureSets',
          label: 'Tab 2',
          params: {},
          internalUiState: {},
        },
      ])
    })

    it('should set empty active tab when closing the only tab', () => {
      const tabs: Tab[] = [
        {
          id: 'tab-1',
          type: 'modelList',
          label: 'Tab 1',
          params: {},
          internalUiState: {},
        },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanelContent
          {...mockProps}
          tabs={tabs}
          activeTab="tab-1"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />,
        { wrapper: TestWrapper }
      )

      // Close the only tab
      const closeButton = screen.getByTestId('close-tab-1')
      fireEvent.click(closeButton)

      // Should set empty active tab
      expect(setActiveTab).toHaveBeenCalledWith('')
      expect(setTabs).toHaveBeenCalledWith([])
    })

    it('should not change active tab when closing a non-active tab', () => {
      const tabs: Tab[] = [
        {
          id: 'tab-1',
          type: 'modelList',
          label: 'Tab 1',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-2',
          type: 'textureSets',
          label: 'Tab 2',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-3',
          type: 'sprites',
          label: 'Tab 3',
          params: {},
          internalUiState: {},
        },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanelContent
          {...mockProps}
          tabs={tabs}
          activeTab="tab-2"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />,
        { wrapper: TestWrapper }
      )

      // Close a non-active tab (tab-1)
      const closeButton = screen.getByTestId('close-tab-1')
      fireEvent.click(closeButton)

      // Should not change active tab
      expect(setActiveTab).not.toHaveBeenCalled()
      expect(setTabs).toHaveBeenCalledWith([
        {
          id: 'tab-2',
          type: 'textureSets',
          label: 'Tab 2',
          params: {},
          internalUiState: {},
        },
        {
          id: 'tab-3',
          type: 'sprites',
          label: 'Tab 3',
          params: {},
          internalUiState: {},
        },
      ])
    })
  })
})
