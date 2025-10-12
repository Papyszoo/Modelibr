import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import DockPanel from '../DockPanel'
import { Tab } from '../../../types'

// Mock PrimeReact components
jest.mock('primereact/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<{ onClick?: (e: React.MouseEvent) => void }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('primereact/contextmenu', () => ({
  ContextMenu: React.forwardRef(
    (
      { children, ...props }: React.PropsWithChildren<unknown>,
      ref: React.Ref<{ hide: () => void; show: (e: unknown) => void }>
    ) => {
      React.useImperativeHandle(ref, () => ({
        hide: jest.fn(),
        show: jest.fn(),
      }))
      return (
        <div {...props}>
          {children}
        </div>
      )
    }
  ),
}))

// Mock TabContent and DraggableTab components
jest.mock('../TabContent', () => {
  return function MockTabContent({ tab }: { tab: Tab }) {
    return <div data-testid="tab-content">{tab.label} Content</div>
  }
})

jest.mock('../DraggableTab', () => {
  return function MockDraggableTab({
    tab,
    isActive,
    onClose,
  }: {
    tab: Tab
    isActive: boolean
    onClose: () => void
  }) {
    return (
      <div data-testid="draggable-tab" data-active={isActive}>
        {tab.label}
        <button
          data-testid={`close-${tab.id}`}
          onClick={onClose}
          aria-label="Close tab"
        >
          ×
        </button>
      </div>
    )
  }
})

jest.mock('../../../hooks/useTabContext', () => ({
  TabProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tab-provider">{children}</div>
  ),
}))

describe('DockPanel', () => {
  const mockProps = {
    side: 'left' as const,
    tabs: [],
    setTabs: jest.fn(),
    activeTab: '',
    setActiveTab: jest.fn(),
    otherTabs: [],
    setOtherTabs: jest.fn(),
    otherActiveTab: '',
    setOtherActiveTab: jest.fn(),
    draggedTab: null,
    setDraggedTab: jest.fn(),
    moveTabBetweenPanels: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render empty dock panel when no tabs are open', () => {
    render(<DockPanel {...mockProps} />)

    expect(screen.getByText('No tabs open')).toBeInTheDocument()
    expect(
      screen.getByText('Click the + button to add a new tab')
    ).toBeInTheDocument()
  })

  it('should render active tab content when tabs are present', () => {
    const tabs: Tab[] = [
      { id: 'test-tab', type: 'modelList', label: 'Test Tab' },
    ]
    const propsWithTabs = {
      ...mockProps,
      tabs,
      activeTab: 'test-tab',
    }

    render(<DockPanel {...propsWithTabs} />)

    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(screen.getByText('Test Tab Content')).toBeInTheDocument()
  })

  it('should have drag handlers on dock-bar but not on active tab content', () => {
    const tabs: Tab[] = [
      { id: 'test-tab', type: 'modelList', label: 'Test Tab' },
    ]
    const propsWithTabs = {
      ...mockProps,
      tabs,
      activeTab: 'test-tab',
    }

    const { container } = render(<DockPanel {...propsWithTabs} />)

    // Find dock-content element - it should not have drag handlers when active tab is present
    const dockContent = container.querySelector('.dock-content')
    expect(dockContent).toBeInTheDocument()

    // The key test: dock content should contain tab content, not empty dock area
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(screen.queryByText('No tabs open')).not.toBeInTheDocument()
  })

  it('should show empty dock area with drag handlers when no tabs are open', () => {
    const { container } = render(<DockPanel {...mockProps} />)

    // Find dock-empty element within dock-content
    const dockEmpty = container.querySelector('.dock-empty')
    expect(dockEmpty).toBeInTheDocument()

    // The key test: empty dock area should be present
    expect(screen.getByText('No tabs open')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
  })

  describe('Tab Closing Behavior', () => {
    it('should activate previous tab when closing the middle active tab', () => {
      const tabs: Tab[] = [
        { id: 'tab-1', type: 'modelList', label: 'Tab 1' },
        { id: 'tab-2', type: 'texture', label: 'Tab 2' },
        { id: 'tab-3', type: 'animation', label: 'Tab 3' },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanel
          {...mockProps}
          tabs={tabs}
          activeTab="tab-2"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />
      )

      // Close the middle tab (tab-2)
      const closeButton = screen.getByTestId('close-tab-2')
      fireEvent.click(closeButton)

      // Should activate the previous tab (tab-1)
      expect(setActiveTab).toHaveBeenCalledWith('tab-1')
      expect(setTabs).toHaveBeenCalledWith([
        { id: 'tab-1', type: 'modelList', label: 'Tab 1' },
        { id: 'tab-3', type: 'animation', label: 'Tab 3' },
      ])
    })

    it('should activate next tab when closing the first active tab', () => {
      const tabs: Tab[] = [
        { id: 'tab-1', type: 'modelList', label: 'Tab 1' },
        { id: 'tab-2', type: 'texture', label: 'Tab 2' },
        { id: 'tab-3', type: 'animation', label: 'Tab 3' },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanel
          {...mockProps}
          tabs={tabs}
          activeTab="tab-1"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />
      )

      // Close the first tab (tab-1)
      const closeButton = screen.getByTestId('close-tab-1')
      fireEvent.click(closeButton)

      // Should activate the next tab (tab-2)
      expect(setActiveTab).toHaveBeenCalledWith('tab-2')
      expect(setTabs).toHaveBeenCalledWith([
        { id: 'tab-2', type: 'texture', label: 'Tab 2' },
        { id: 'tab-3', type: 'animation', label: 'Tab 3' },
      ])
    })

    it('should activate previous tab when closing the last active tab', () => {
      const tabs: Tab[] = [
        { id: 'tab-1', type: 'modelList', label: 'Tab 1' },
        { id: 'tab-2', type: 'texture', label: 'Tab 2' },
        { id: 'tab-3', type: 'animation', label: 'Tab 3' },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanel
          {...mockProps}
          tabs={tabs}
          activeTab="tab-3"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />
      )

      // Close the last tab (tab-3)
      const closeButton = screen.getByTestId('close-tab-3')
      fireEvent.click(closeButton)

      // Should activate the previous tab (tab-2)
      expect(setActiveTab).toHaveBeenCalledWith('tab-2')
      expect(setTabs).toHaveBeenCalledWith([
        { id: 'tab-1', type: 'modelList', label: 'Tab 1' },
        { id: 'tab-2', type: 'texture', label: 'Tab 2' },
      ])
    })

    it('should set empty active tab when closing the only tab', () => {
      const tabs: Tab[] = [{ id: 'tab-1', type: 'modelList', label: 'Tab 1' }]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanel
          {...mockProps}
          tabs={tabs}
          activeTab="tab-1"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />
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
        { id: 'tab-1', type: 'modelList', label: 'Tab 1' },
        { id: 'tab-2', type: 'texture', label: 'Tab 2' },
        { id: 'tab-3', type: 'animation', label: 'Tab 3' },
      ]
      const setActiveTab = jest.fn()
      const setTabs = jest.fn()

      render(
        <DockPanel
          {...mockProps}
          tabs={tabs}
          activeTab="tab-2"
          setActiveTab={setActiveTab}
          setTabs={setTabs}
        />
      )

      // Close a non-active tab (tab-1)
      const closeButton = screen.getByTestId('close-tab-1')
      fireEvent.click(closeButton)

      // Should not change active tab
      expect(setActiveTab).not.toHaveBeenCalled()
      expect(setTabs).toHaveBeenCalledWith([
        { id: 'tab-2', type: 'texture', label: 'Tab 2' },
        { id: 'tab-3', type: 'animation', label: 'Tab 3' },
      ])
    })
  })
})
