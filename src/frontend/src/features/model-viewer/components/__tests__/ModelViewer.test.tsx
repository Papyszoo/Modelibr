import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'

import { ModelProvider } from '@/contexts/ModelContext'
import { ModelViewer } from '@/features/model-viewer/components/ModelViewer'

// Mock modelVersionApi
const mockCreateModelVersion = jest.fn()
jest.mock('../../api/modelVersionApi', () => ({
  __esModule: true,
  createModelVersion: (...args: unknown[]) => mockCreateModelVersion(...args),
  addFileToVersion: jest.fn(),
  setActiveVersion: jest.fn(),
  softDeleteModelVersion: jest.fn(),
  setMainVariant: jest.fn(),
}))

// Mock queries used by ModelViewer
jest.mock('../../api/queries', () => ({
  useModelByIdQuery: () => ({ data: null, refetch: jest.fn() }),
  useModelVersionsQuery: () => ({
    data: [],
    refetch: jest.fn(),
    isLoading: false,
  }),
}))

jest.mock('@/features/texture-set/api/queries', () => ({
  useTextureSetByIdQuery: () => ({ data: null }),
  useTextureSetsByModelVersionQuery: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    refetch: jest.fn(),
  }),
}))

jest.mock('@/shared/thumbnail', () => ({
  useModelThumbnailUpdates: jest.fn(),
}))

jest.mock('@/shared/thumbnail/api/thumbnailApi', () => ({
  regenerateThumbnail: jest.fn(),
}))

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

jest.mock('../ViewerMenubar', () => ({
  ViewerMenubar: function MockViewerMenubar(props: any) {
    return <div data-testid="viewer-menubar" />
  },
}))

jest.mock('../ViewerSidePanel', () => ({
  ViewerSidePanel: function MockViewerSidePanel(props: any) {
    return <div data-testid="viewer-side-panel" />
  },
}))

jest.mock('../FileUploadModal', () => ({
  FileUploadModal: ({ visible }: { visible: boolean }) => (
    <div data-testid="file-upload-modal" data-visible={String(visible)} />
  ),
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

// Mock @react-three/drei
jest.mock('@react-three/drei', () => ({
  Stats: () => null,
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
    id: '1',
    name: 'Test Model',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    files: [
      {
        id: '123',
        originalFileName: 'test.obj',
        isRenderable: true,
      },
    ],
  } as any

  it('should render Canvas and scene when model is provided', () => {
    renderWithProviders(<ModelViewer model={mockModel} side="left" />)

    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    expect(screen.getByTestId('model-preview-scene')).toBeInTheDocument()
  })

  it('should display model name', () => {
    renderWithProviders(<ModelViewer model={mockModel} side="left" />)

    expect(screen.getByText('Test Model')).toBeInTheDocument()
  })

  it('should render the menubar', () => {
    renderWithProviders(<ModelViewer model={mockModel} side="left" />)

    expect(screen.getByTestId('viewer-menubar')).toBeInTheDocument()
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

  describe('.blend drop behavior', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    const createDropEvent = (fileName: string) => {
      const file = new File(['data'], fileName, {
        type: 'application/octet-stream',
      })
      const dataTransfer = {
        files: [file],
        items: [{ kind: 'file', getAsFile: () => file }],
        types: ['Files'],
      }
      return { file, dataTransfer }
    }

    it('should open the FileUploadModal when a .blend file is dropped', async () => {
      renderWithProviders(<ModelViewer model={mockModel} side="left" />)

      // Modal should start hidden
      expect(screen.getByTestId('file-upload-modal')).toHaveAttribute(
        'data-visible',
        'false'
      )

      const { dataTransfer } = createDropEvent('scene.blend')
      const dropTarget =
        screen.getByTestId('canvas').closest('.model-viewer') ||
        screen.getByTestId('canvas').parentElement?.parentElement

      if (dropTarget) {
        fireEvent.drop(dropTarget, { dataTransfer })
      }

      // Modal should now be visible — .blend goes through the same modal as other files
      await waitFor(() => {
        expect(screen.getByTestId('file-upload-modal')).toHaveAttribute(
          'data-visible',
          'true'
        )
      })

      // createModelVersion should NOT be called directly — the user must confirm in the modal
      expect(mockCreateModelVersion).not.toHaveBeenCalled()
    })

    it('should NOT call createModelVersion directly when .blend file is dropped', async () => {
      mockCreateModelVersion.mockResolvedValue({
        id: 10,
        versionNumber: 2,
      })

      renderWithProviders(<ModelViewer model={mockModel} side="left" />)

      const { dataTransfer } = createDropEvent('scene.blend')
      const dropTarget =
        screen.getByTestId('canvas').closest('.model-viewer') ||
        screen.getByTestId('canvas').parentElement?.parentElement

      if (dropTarget) {
        fireEvent.drop(dropTarget, { dataTransfer })
      }

      await waitFor(() => {
        // Modal opens, but createModelVersion is not called until modal is submitted
        expect(mockCreateModelVersion).not.toHaveBeenCalled()
      })
    })

    it('should open the FileUploadModal for non-.blend file drop', async () => {
      renderWithProviders(<ModelViewer model={mockModel} side="left" />)

      const { dataTransfer } = createDropEvent('model.obj')
      const dropTarget =
        screen.getByTestId('canvas').closest('.model-viewer') ||
        screen.getByTestId('canvas').parentElement?.parentElement

      if (dropTarget) {
        fireEvent.drop(dropTarget, { dataTransfer })
      }

      await waitFor(() => {
        expect(screen.getByTestId('file-upload-modal')).toHaveAttribute(
          'data-visible',
          'true'
        )
      })
    })
  })
})
