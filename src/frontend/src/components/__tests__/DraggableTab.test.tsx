import { render, screen, fireEvent, act } from '@testing-library/react'
import DraggableTab from '../layout/DraggableTab'
import { Tab } from '../../types'

describe('DraggableTab', () => {
  const mockTab: Tab = {
    id: 'test-tab-1',
    type: 'modelList',
    label: 'Test Tab',
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

    const tabElement = screen.getByTitle('Test Tab')
    expect(tabElement).toBeInTheDocument()
    expect(tabElement).toHaveClass('draggable-tab')

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-list')
  })

  it('should apply active class when isActive is true', () => {
    render(<DraggableTab {...defaultProps} isActive={true} />)

    const tabElement = screen.getByTitle('Test Tab')
    expect(tabElement).toHaveClass('active')
  })

  it('should call onSelect when clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = screen.getByTitle('Test Tab')
    fireEvent.click(tabElement)

    expect(defaultProps.onSelect).toHaveBeenCalledTimes(1)
  })

  it('should show context menu on right-click', async () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = screen.getByTitle('Test Tab')

    await act(async () => {
      fireEvent.contextMenu(tabElement)
    })

    // The context menu should be present in the DOM
    const contextMenu = screen.getByText('Close Tab')
    expect(contextMenu).toBeInTheDocument()
  })

  it('should call onClose when context menu close option is clicked', async () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = screen.getByTitle('Test Tab')

    await act(async () => {
      fireEvent.contextMenu(tabElement)
    })

    const closeOption = screen.getByText('Close Tab')

    await act(async () => {
      fireEvent.click(closeOption)
    })

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('should prevent default context menu behavior', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = screen.getByTitle('Test Tab')
    const contextMenuEvent = new MouseEvent('contextmenu', { bubbles: true })
    const preventDefaultSpy = jest.spyOn(contextMenuEvent, 'preventDefault')

    fireEvent(tabElement, contextMenuEvent)

    expect(preventDefaultSpy).toHaveBeenCalled()
  })

  it('should handle drag start correctly', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = screen.getByTitle('Test Tab')

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

    const tabElement = screen.getByTitle('Test Tab')
    fireEvent.dragEnd(tabElement)

    expect(defaultProps.onDragEnd).toHaveBeenCalledTimes(1)
  })

  it('should display correct tooltip for different tab types', () => {
    const modelViewerTab: Tab = {
      id: 'test-tab-2',
      type: 'modelViewer',
      modelId: 'model-123',
    }

    render(<DraggableTab {...defaultProps} tab={modelViewerTab} />)

    const tabElement = screen.getByTitle('Model: model-123')
    expect(tabElement).toBeInTheDocument()
  })

  it('should not have close button in DOM', () => {
    render(<DraggableTab {...defaultProps} />)

    // The old close button should not exist anymore
    const closeButton = document.querySelector('.tab-close-button')
    expect(closeButton).not.toBeInTheDocument()
  })
})
