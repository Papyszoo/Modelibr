import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { ModelViewer } from '@/features/model-viewer/components/ModelViewer'
import { ModelProvider } from '@/contexts/ModelContext'

// Mock ApiClient
jest.mock('../../../../services/ApiClient', () => ({
  __esModule: true,
  apiClient: {
    getModelById: jest.fn(),
    regenerateThumbnail: jest.fn(),
    getFileUrl: jest.fn((id: string) => `http://api.test/files/${id}`),
    getModelVersions: jest.fn().mockResolvedValue([]),
    getTextureSetById: jest.fn(),
    getThumbnailUrl: jest.fn(
      (id: string) => `http://api.test/models/${id}/thumbnail`
    ),
  },
}))

// Mock @react-three/fiber
jest.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: any) => <div data-testid="canvas">{children}</div>,
}))

// Mock child components
jest.mock('../ModelPreviewScene', () => ({
  Scene: function MockModelPreviewScene(props: any) {
    return (
      <div data-testid="model-preview-scene" data-model-id={props.model?.id} />
    )
  },
}))

jest.mock('../ModelInfoWindow', () => ({
  ModelInfoWindow: function MockModelInfoWindow() {
    return <div data-testid="model-info-window" />
  },
}))

jest.mock('../ThumbnailWindow', () => ({
  ThumbnailWindow: function MockThumbnailWindow() {
    return <div data-testid="thumbnail-window" />
  },
}))

jest.mock('../ModelHierarchyWindow', () => ({
  ModelHierarchyWindow: function MockModelHierarchyWindow() {
    return <div data-testid="model-hierarchy-window" />
  },
}))

jest.mock('../ViewerSettingsWindow', () => ({
  ViewerSettingsWindow: function MockViewerSettingsWindow() {
    return <div data-testid="viewer-settings-window" />
  },
}))

jest.mock('../UVMapWindow', () => ({
  UVMapWindow: function MockUVMapWindow() {
    return <div data-testid="uv-map-window" />
  },
}))

jest.mock('../TextureSetSelectorWindow', () => ({
  TextureSetSelectorWindow: function MockTextureSetSelectorWindow() {
    return <div data-testid="texture-set-selector-window" />
  },
}))

jest.mock('../ModelVersionWindow', () => ({
  ModelVersionWindow: function MockModelVersionWindow() {
    return <div data-testid="model-version-window" />
  },
}))

jest.mock('../FileUploadModal', () => ({
  FileUploadModal: () => <div data-testid="file-upload-modal" />,
}))

jest.mock('../VersionStrip', () => ({
  VersionStrip: function MockVersionStrip() {
    return <div data-testid="version-strip" />
  },
}))

// Mock Toast
jest.mock('primereact/toast', () => ({
  Toast: () => <div data-testid="toast" />,
}))

// Mock Button
jest.mock('primereact/button', () => ({
  Button: ({ onClick, tooltip, ...props }: any) => (
    <button onClick={onClick} {...props} data-testid="button" title={tooltip} />
  ),
}))

describe('ModelViewer', () => {
  const renderWithProviders = (ui: ReactElement) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <ModelProvider>{ui}</ModelProvider>
      </QueryClientProvider>
    )
  }

  const mockModel = {
    id: 1,
    name: 'Test Model',
    files: [
      {
        id: '123',
        originalFileName: 'test.obj',
        isRenderable: true,
      },
    ],
  }

  it('should render Canvas and scene when model is provided', () => {
    renderWithProviders(<ModelViewer model={mockModel} side="left" />)

    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    expect(screen.getByTestId('model-preview-scene')).toBeInTheDocument()
  })

  it('should display model name in header', () => {
    renderWithProviders(<ModelViewer model={mockModel} side="left" />)

    expect(screen.getByText('Test Model')).toBeInTheDocument()
  })

  it('should render viewer control buttons', () => {
    renderWithProviders(<ModelViewer model={mockModel} side="left" />)

    const buttons = screen.getAllByTestId('button')
    // There should be multiple control buttons (settings, info, texture, hierarchy, thumbnail, uv)
    // Note: Version button was removed since versions are now in header strip
    expect(buttons.length).toBeGreaterThanOrEqual(6)
  })

  it('should pass model to ModelPreviewScene', () => {
    renderWithProviders(<ModelViewer model={mockModel} side="left" />)

    const scene = screen.getByTestId('model-preview-scene')
    expect(scene).toHaveAttribute('data-model-id', '1')
  })

  it('should render correctly when model prop changes', () => {
    const { rerender, getByTestId } = renderWithProviders(
      <ModelViewer model={mockModel} side="left" />
    )

    // Initial render should show the canvas and scene
    expect(getByTestId('canvas')).toBeInTheDocument()
    expect(getByTestId('model-preview-scene')).toBeInTheDocument()

    const mockModel2 = { ...mockModel, id: 2, name: 'Another Model' }
    const nextQueryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    rerender(
      <QueryClientProvider client={nextQueryClient}>
        <ModelProvider>
          <ModelViewer model={mockModel2} side="left" />
        </ModelProvider>
      </QueryClientProvider>
    )

    // After rerender, the component should still be functional
    expect(getByTestId('canvas')).toBeInTheDocument()
    expect(getByTestId('model-preview-scene')).toBeInTheDocument()
  })

  it('should show error message when no model data is available', () => {
    renderWithProviders(<ModelViewer model={undefined} side="left" />)

    expect(screen.getByText('No model data available')).toBeInTheDocument()
  })
})
