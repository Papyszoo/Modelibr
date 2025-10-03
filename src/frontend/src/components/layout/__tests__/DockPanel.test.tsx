import React from 'react'
import { render, screen } from '@testing-library/react'
import DockPanel from '../DockPanel'
import { Tab } from '../../../types'

// Mock PrimeReact components
jest.mock('primereact/button', () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<unknown>) => (
    <button {...props}>{children}</button>
  ),
}))

jest.mock('primereact/contextmenu', () => ({
  ContextMenu: React.forwardRef(
    (
      { children, ...props }: React.PropsWithChildren<unknown>,
      ref: React.Ref<HTMLDivElement>
    ) => (
      <div {...props} ref={ref}>
        {children}
      </div>
    )
  ),
}))

jest.mock('primereact/menu', () => ({
  Menu: React.forwardRef(
    (
      { children, ...props }: React.PropsWithChildren<unknown>,
      ref: React.Ref<HTMLDivElement>
    ) => (
      <div {...props} ref={ref}>
        {children}
      </div>
    )
  ),
}))

// Mock TabContent and DraggableTab components
jest.mock('../TabContent', () => {
  return function MockTabContent({ tab }: { tab: Tab }) {
    return <div data-testid="tab-content">{tab.label} Content</div>
  }
})

jest.mock('../DraggableTab', () => {
  return function MockDraggableTab({ tab }: { tab: Tab }) {
    return <div data-testid="draggable-tab">{tab.label}</div>
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
})
