import { render, screen, fireEvent } from '@testing-library/react'
import DraggableTab from '@/components/layout/DraggableTab'
import { Tab } from '@/types'

// Mock navigationStore to avoid import.meta.env chain
jest.mock('@/stores/navigationStore', () => ({
  getWindowId: () => 'test-window-id',
  useNavigationStore: Object.assign(
    jest.fn(() => ({})),
    {
      getState: () => ({}),
    }
  ),
  createTab: (type: string) => ({
    id: type,
    type,
    label: type,
    params: {},
    internalUiState: {},
  }),
  broadcastNavigation: jest.fn(),
}))

// Helper function to find element by data-pr-tooltip attribute
const getByTooltip = (tooltip: string): HTMLElement => {
  const element = document.querySelector(`[data-pr-tooltip="${tooltip}"]`)
  if (!element) {
    throw new Error(
      `Unable to find an element with data-pr-tooltip: ${tooltip}`
    )
  }
  return element as HTMLElement
}

describe('DraggableTab', () => {
  const mockTab: Tab = {
    id: 'test-tab-1',
    type: 'modelList',
    label: 'Test Tab',
    params: {},
    internalUiState: {},
  }

  const defaultProps = {
    tab: mockTab,
    isActive: false,
    onSelect: jest.fn(),
    onClose: jest.fn(),
    onDragStart: jest.fn(),
    onDragEnd: jest.fn(),
    side: 'left' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render tab with correct icon', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')
    expect(tabElement).toBeInTheDocument()
    expect(tabElement).toHaveClass('draggable-tab')

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-list')
  })

  it('should apply active class when isActive is true', () => {
    render(<DraggableTab {...defaultProps} isActive={true} />)

    const tabElement = getByTooltip('Models List')
    expect(tabElement).toHaveClass('active')
  })

  it('should call onSelect when clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')
    fireEvent.click(tabElement)

    expect(defaultProps.onSelect).toHaveBeenCalledTimes(1)
  })

  it('should have close button that calls onClose when clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const closeButton = screen.getByLabelText('Close tab')
    expect(closeButton).toBeInTheDocument()

    fireEvent.click(closeButton)

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSelect).not.toHaveBeenCalled() // Should not trigger select
  })

  it('should handle drag start correctly', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')

    // Create a mock dataTransfer object
    const mockDataTransfer = {
      effectAllowed: '',
      setData: jest.fn(),
    }

    // Use fireEvent.dragStart with a mock event
    fireEvent.dragStart(tabElement, {
      dataTransfer: mockDataTransfer,
    })

    expect(defaultProps.onDragStart).toHaveBeenCalledWith(mockTab)
    expect(mockDataTransfer.effectAllowed).toBe('move')
    expect(mockDataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      'test-tab-1'
    )
  })

  it('should handle drag end correctly', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')
    fireEvent.dragEnd(tabElement)

    expect(defaultProps.onDragEnd).toHaveBeenCalledTimes(1)
  })

  it('should display correct tooltip for modelViewer tab type', () => {
    const modelViewerTab: Tab = {
      id: 'test-tab-2',
      type: 'modelViewer',
      modelId: 'model-123',
      params: { modelId: 'model-123' },
      internalUiState: {},
    }

    render(<DraggableTab {...defaultProps} tab={modelViewerTab} />)

    const tabElement = getByTooltip('Model: model-123')
    expect(tabElement).toBeInTheDocument()
  })

  it('should have close button visible in DOM', () => {
    render(<DraggableTab {...defaultProps} />)

    // The close button should exist
    const closeButton = screen.getByLabelText('Close tab')
    expect(closeButton).toBeInTheDocument()
  })

  it('should close tab when middle mouse button is clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')

    // Simulate middle button click (button: 1)
    fireEvent.mouseDown(tabElement, { button: 1 })

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSelect).not.toHaveBeenCalled() // Should not trigger select
  })

  it('should not close tab when left mouse button is clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')

    // Simulate left button click (button: 0)
    fireEvent.mouseDown(tabElement, { button: 0 })

    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('should not close tab when right mouse button is clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')

    // Simulate right button click (button: 2)
    fireEvent.mouseDown(tabElement, { button: 2 })

    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('should render textureSets tab with folder icon', () => {
    const textureSetsTab: Tab = {
      id: 'test-tab-3',
      type: 'textureSets',
      label: 'Texture Sets',
      params: {},
      internalUiState: {},
    }

    render(<DraggableTab {...defaultProps} tab={textureSetsTab} />)

    const tabElement = getByTooltip('Texture Sets')
    expect(tabElement).toBeInTheDocument()

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-folder')
  })

  it('should render textureSetViewer tab with image icon', () => {
    const textureSetViewerTab: Tab = {
      id: 'test-tab-4',
      type: 'textureSetViewer',
      setId: 'set-123',
      params: { setId: 'set-123' },
      internalUiState: {},
    }

    render(<DraggableTab {...defaultProps} tab={textureSetViewerTab} />)

    const tabElement = getByTooltip('Texture Set: set-123')
    expect(tabElement).toBeInTheDocument()

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-image')
  })
})
