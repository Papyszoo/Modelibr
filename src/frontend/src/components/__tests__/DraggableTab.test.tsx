import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactElement } from 'react'

import { DraggableTab } from '@/components/layout/DraggableTab'
import { client } from '@/lib/apiBase'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'
import { type Tab } from '@/types'

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

// Asset tabs read their thumbnail through React Query.
const renderTab = (ui: ReactElement) =>
  render(ui, { wrapper: createQueryWrapper(createTestQueryClient()) })

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
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render tab with correct icon', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')
    expect(tabElement).toBeInTheDocument()
    expect(tabElement).toHaveClass('draggable-tab')

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-list')
  })

  it('should apply active class when isActive is true', () => {
    renderTab(<DraggableTab {...defaultProps} isActive={true} />)

    const tabElement = getByTooltip('Models List')
    expect(tabElement).toHaveClass('active')
  })

  it('should call onSelect when clicked', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')
    fireEvent.click(tabElement)

    expect(defaultProps.onSelect).toHaveBeenCalledTimes(1)
  })

  it('opens its tooltip to the right by default', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    expect(getByTooltip('Models List')).toHaveAttribute(
      'data-pr-position',
      'right'
    )
  })

  // Regression: clicking a tab left the tooltip hanging over the page because
  // the pointer never left the icon. The click must dismiss it.
  it('dismisses the tooltip when the tab is clicked', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')
    const onMouseLeave = jest.fn()
    tabElement.addEventListener('mouseleave', onMouseLeave)

    fireEvent.click(tabElement)

    expect(onMouseLeave).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSelect).toHaveBeenCalledTimes(1)
  })

  it('should have close button that calls onClose when clicked', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    const closeButton = screen.getByLabelText('Close tab')
    expect(closeButton).toBeInTheDocument()

    fireEvent.click(closeButton)

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSelect).not.toHaveBeenCalled() // Should not trigger select
  })

  it('should handle drag start correctly', () => {
    renderTab(<DraggableTab {...defaultProps} />)

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
    renderTab(<DraggableTab {...defaultProps} />)

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

    renderTab(<DraggableTab {...defaultProps} tab={modelViewerTab} />)

    const tabElement = getByTooltip('Model: model-123')
    expect(tabElement).toBeInTheDocument()
  })

  it('should have close button visible in DOM', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    // The close button should exist
    const closeButton = screen.getByLabelText('Close tab')
    expect(closeButton).toBeInTheDocument()
  })

  // A pinned page in the main dock stays in its slot: closing it would only
  // swap the tab for its pinned entry, so it offers no way to close.
  it('has no close button and ignores middle-click when not closable', () => {
    renderTab(<DraggableTab {...defaultProps} closable={false} />)

    expect(screen.queryByLabelText('Close tab')).toBeNull()
    fireEvent.mouseDown(getByTooltip('Models List'), { button: 1 })
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('should close tab when middle mouse button is clicked', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')

    // Simulate middle button click (button: 1)
    fireEvent.mouseDown(tabElement, { button: 1 })

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSelect).not.toHaveBeenCalled() // Should not trigger select
  })

  it('should not close tab when left mouse button is clicked', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')

    // Simulate left button click (button: 0)
    fireEvent.mouseDown(tabElement, { button: 0 })

    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('should not close tab when right mouse button is clicked', () => {
    renderTab(<DraggableTab {...defaultProps} />)

    const tabElement = getByTooltip('Models List')

    // Simulate right button click (button: 2)
    fireEvent.mouseDown(tabElement, { button: 2 })

    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('should render modelTextures tab with images icon', () => {
    const modelTexturesTab: Tab = {
      id: 'test-tab-3',
      type: 'modelTextures',
      label: 'Multi-Model Textures',
      params: {},
      internalUiState: {},
    }

    renderTab(<DraggableTab {...defaultProps} tab={modelTexturesTab} />)

    const tabElement = getByTooltip('Multi-Model Textures')
    expect(tabElement).toBeInTheDocument()

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-images')
  })

  it('should render textureSetViewer tab with its own icon', () => {
    const textureSetViewerTab: Tab = {
      id: 'test-tab-4',
      type: 'textureSetViewer',
      setId: 'set-123',
      params: { setId: 'set-123' },
      internalUiState: {},
    }

    renderTab(<DraggableTab {...defaultProps} tab={textureSetViewerTab} />)

    const tabElement = getByTooltip('Texture Set: set-123')
    expect(tabElement).toBeInTheDocument()

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-clone')
  })

  it('should render environmentMapViewer tab with its own icon and tooltip', () => {
    const environmentMapViewerTab: Tab = {
      id: 'environment-map-77',
      type: 'environmentMapViewer',
      environmentMapId: '77',
      params: { environmentMapId: '77' },
      internalUiState: {},
    }

    renderTab(<DraggableTab {...defaultProps} tab={environmentMapViewerTab} />)

    const tabElement = getByTooltip('Environment Map: 77')
    expect(tabElement).toBeInTheDocument()

    const icon = tabElement.querySelector('.tab-icon')
    expect(icon).toHaveClass('pi', 'pi-sun')
  })

  // Two open models used to be two identical cube buttons: the tab must show
  // the model's own thumbnail once the model detail (the viewer's query) has
  // one, and fall back to the kind icon when the image fails to load.
  describe('asset thumbnail', () => {
    const modelTab: Tab = {
      id: 'model-42',
      type: 'modelViewer',
      label: 'Crate',
      modelId: '42',
      params: { modelId: '42' },
      internalUiState: {},
    }

    beforeEach(() => {
      ;(client.get as jest.Mock).mockImplementation((url: string) =>
        url === '/models/42' || url === '/models/43'
          ? Promise.resolve({
              data: {
                id: Number(url.slice(8)),
                name: url === '/models/42' ? 'Crate' : 'Broken',
                pngThumbnailUrl: `/model-versions/${url.slice(8)}/thumbnail/png-file?t=1`,
              },
            })
          : Promise.reject(new Error(`unexpected ${url}`))
      )
    })

    afterEach(() => {
      ;(client.get as jest.Mock).mockReset()
    })

    const thumbUrl =
      'http://localhost:8080/model-versions/42/thumbnail/png-file?t=1'
    const loadingImage = async (tabElement: HTMLElement) => {
      await waitFor(() =>
        expect(tabElement.querySelector('img')).not.toBeNull()
      )
      return tabElement.querySelector('img') as HTMLImageElement
    }

    it('shows the model thumbnail instead of the cube icon once loaded', async () => {
      renderTab(<DraggableTab {...defaultProps} tab={modelTab} />)
      const tabElement = getByTooltip('Model: Crate')

      // While it loads, the kind icon holds the slot.
      const loading = await loadingImage(tabElement)
      expect(loading).toHaveAttribute('src', thumbUrl)
      expect(tabElement.querySelector('.pi-box')).not.toBeNull()

      fireEvent.load(loading)

      // jsdom cannot read pixels, so the untrimmed image is shown.
      const shown = tabElement.querySelector('.tab-thumbnail img')
      expect(shown).toHaveAttribute('src', thumbUrl)
      expect(tabElement.querySelector('.pi-box')).toBeNull()
    })

    // A tab remounts when it moves panel or the shell re-lays out; it used to
    // drop back to the cube until the image loaded and was trimmed again.
    it('keeps the thumbnail when the tab remounts', async () => {
      const first = renderTab(<DraggableTab {...defaultProps} tab={modelTab} />)
      fireEvent.load(await loadingImage(getByTooltip('Model: Crate')))
      first.unmount()

      renderTab(<DraggableTab {...defaultProps} tab={modelTab} />)
      const tabElement = getByTooltip('Model: Crate')
      await waitFor(() =>
        expect(tabElement.querySelector('.tab-thumbnail img')).toHaveAttribute(
          'src',
          thumbUrl
        )
      )
      expect(tabElement.querySelector('img[hidden]')).toBeNull()
      expect(tabElement.querySelector('.pi-box')).toBeNull()
    })

    it('falls back to the kind icon when the thumbnail fails', async () => {
      const brokenTab: Tab = {
        ...modelTab,
        id: 'model-43',
        label: 'Broken',
        modelId: '43',
        params: { modelId: '43' },
      }
      renderTab(<DraggableTab {...defaultProps} tab={brokenTab} />)
      const tabElement = getByTooltip('Model: Broken')

      fireEvent.error(await loadingImage(tabElement))

      expect(tabElement.querySelector('img')).toBeNull()
      expect(tabElement.querySelector('.tab-icon')).toHaveClass('pi-box')
    })
  })
})
