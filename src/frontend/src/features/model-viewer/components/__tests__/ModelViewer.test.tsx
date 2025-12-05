import { render, screen } from '@testing-library/react'
import ModelViewer from '../ModelViewer'
import { ModelProvider } from '../../../../contexts/ModelContext'

// Mock ApiClient
jest.mock('../../../../services/ApiClient', () => ({
  __esModule: true,
  default: {
    getModelById: jest.fn(),
    regenerateThumbnail: jest.fn(),
    getFileUrl: jest.fn((id: string) => `http://api.test/files/${id}`),
    getModelVersions: jest.fn().mockResolvedValue([]),
    getTextureSetById: jest.fn(),
    getThumbnailUrl: jest.fn((id: string) => `http://api.test/models/${id}/thumbnail`),
  },
}))

// Mock @react-three/fiber
jest.mock('@react-three/fiber', () => ({
  Canvas: ({ children, ...props }: any) => (
    <div data-testid="canvas" {...props}>
      {children}
    </div>
  ),
}))

// Mock child components
jest.mock('../ModelPreviewScene', () => {
  return function MockModelPreviewScene(props: any) {
    return <div data-testid="model-preview-scene" data-model-id={props.model?.id} />
  }
})

jest.mock('../ModelInfoWindow', () => {
  return function MockModelInfoWindow() {
    return <div data-testid="model-info-window" />
  }
})

jest.mock('../ThumbnailWindow', () => {
  return function MockThumbnailWindow() {
    return <div data-testid="thumbnail-window" />
  }
})

jest.mock('../ModelHierarchyWindow', () => {
  return function MockModelHierarchyWindow() {
    return <div data-testid="model-hierarchy-window" />
  }
})

jest.mock('../ViewerSettingsWindow', () => {
  return function MockViewerSettingsWindow() {
    return <div data-testid="viewer-settings-window" />
  }
})

jest.mock('../UVMapWindow', () => {
  return function MockUVMapWindow() {
    return <div data-testid="uv-map-window" />
  }
})

jest.mock('../TextureSetSelectorWindow', () => {
  return function MockTextureSetSelectorWindow() {
    return <div data-testid="texture-set-selector-window" />
  }
})

jest.mock('../ModelVersionWindow', () => {
  return function MockModelVersionWindow() {
    return <div data-testid="model-version-window" />
  }
})

jest.mock('../FileUploadModal', () => ({
  FileUploadModal: () => <div data-testid="file-upload-modal" />,
}))

jest.mock('../VersionStrip', () => {
  return function MockVersionStrip() {
    return <div data-testid="version-strip" />
  }
})

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
    render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    expect(screen.getByTestId('model-preview-scene')).toBeInTheDocument()
  })

  it('should display model name in header', () => {
    render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    expect(screen.getByText('Test Model')).toBeInTheDocument()
  })

  it('should render viewer control buttons', () => {
    render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    const buttons = screen.getAllByTestId('button')
    // There should be multiple control buttons (settings, info, texture, hierarchy, thumbnail, uv)
    // Note: Version button was removed since versions are now in header strip
    expect(buttons.length).toBeGreaterThanOrEqual(6)
  })

  it('should pass model to ModelPreviewScene', () => {
    render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    const scene = screen.getByTestId('model-preview-scene')
    expect(scene).toHaveAttribute('data-model-id', '1')
  })

  it('should render correctly when model prop changes', () => {
    const { rerender, getByTestId } = render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    // Initial render should show the canvas and scene
    expect(getByTestId('canvas')).toBeInTheDocument()
    expect(getByTestId('model-preview-scene')).toBeInTheDocument()

    const mockModel2 = { ...mockModel, id: 2, name: 'Another Model' }
    rerender(
      <ModelProvider>
        <ModelViewer model={mockModel2} side="left" />
      </ModelProvider>
    )

    // After rerender, the component should still be functional
    expect(getByTestId('canvas')).toBeInTheDocument()
    expect(getByTestId('model-preview-scene')).toBeInTheDocument()
  })

  it('should show error message when no model data is available', () => {
    render(
      <ModelProvider>
        <ModelViewer model={undefined} side="left" />
      </ModelProvider>
    )

    expect(screen.getByText('No model data available')).toBeInTheDocument()
  })
})
