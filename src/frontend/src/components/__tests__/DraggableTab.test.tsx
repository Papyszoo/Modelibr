import { render, screen, fireEvent } from '@testing-library/react'
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

  it('should have close button that calls onClose when clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const closeButton = screen.getByLabelText('Close tab')
    expect(closeButton).toBeInTheDocument()

    fireEvent.click(closeButton)

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSelect).not.toHaveBeenCalled() // Should not trigger select
  })

  it('should display correct tooltip for different tab types', () => {
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

  it('should have close button visible in DOM', () => {
    render(<DraggableTab {...defaultProps} />)

    // The close button should exist
    const closeButton = screen.getByLabelText('Close tab')
    expect(closeButton).toBeInTheDocument()
  })

  it('should close tab when middle mouse button is clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = screen.getByTitle('Test Tab')

    // Simulate middle button click (button: 1)
    fireEvent.mouseDown(tabElement, { button: 1 })

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSelect).not.toHaveBeenCalled() // Should not trigger select
  })

  it('should not close tab when left mouse button is clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = screen.getByTitle('Test Tab')

    // Simulate left button click (button: 0)
    fireEvent.mouseDown(tabElement, { button: 0 })

    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('should not close tab when right mouse button is clicked', () => {
    render(<DraggableTab {...defaultProps} />)

    const tabElement = screen.getByTitle('Test Tab')

    // Simulate right button click (button: 2)
    fireEvent.mouseDown(tabElement, { button: 2 })

    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('should render textureSets tab with palette icon', () => {
    const textureSetsTab: Tab = {
      id: 'test-tab-3',
      type: 'textureSets',
      label: 'Texture Sets',
    }

    render(<DraggableTab {...defaultProps} tab={textureSetsTab} />)

    const tabElement = screen.getByTitle('Texture Sets')
    expect(tabElement).toBeInTheDocument()

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-palette')
  })

  it('should render textureSetViewer tab with images icon', () => {
    const textureSetViewerTab: Tab = {
      id: 'test-tab-4',
      type: 'textureSetViewer',
      setId: 'set-123',
    }

    render(<DraggableTab {...defaultProps} tab={textureSetViewerTab} />)

    const tabElement = screen.getByTitle('Texture Set: set-123')
    expect(tabElement).toBeInTheDocument()

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-images')
  })
})
