import { render } from '@testing-library/react'
import ModelViewer from '../ModelViewer'
import { ModelProvider } from '../../../../contexts/ModelContext'

// Mock ApiClient
jest.mock('../../../../services/ApiClient', () => ({
  __esModule: true,
  default: {
    getModelById: jest.fn(),
    regenerateThumbnail: jest.fn(),
    getFileUrl: jest.fn((id: string) => `http://api.test/files/${id}`),
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
    return <div data-testid="model-preview-scene" {...props} />
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

// Mock Toast
jest.mock('primereact/toast', () => ({
  Toast: () => <div data-testid="toast" />,
}))

// Mock Button
jest.mock('primereact/button', () => ({
  Button: ({ onClick, ...props }: any) => (
    <button onClick={onClick} {...props} data-testid="button" />
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

  it('should render with unique Canvas key based on model id and side', () => {
    const { container } = render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    const canvas = container.querySelector('[data-testid="canvas"]')
    expect(canvas).toHaveAttribute('key', 'canvas-1-left')
  })

  it('should render with different Canvas key for different side', () => {
    const { container } = render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="right" />
      </ModelProvider>
    )

    const canvas = container.querySelector('[data-testid="canvas"]')
    expect(canvas).toHaveAttribute('key', 'canvas-1-right')
  })

  it('should render with unique scene key based on model id and side', () => {
    const { container } = render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    const scene = container.querySelector('[data-testid="model-preview-scene"]')
    expect(scene).toHaveAttribute('key', 'scene-1-left')
  })

  it('should render Canvas and scene when model is loaded', () => {
    const { getByTestId } = render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    expect(getByTestId('canvas')).toBeInTheDocument()
    expect(getByTestId('model-preview-scene')).toBeInTheDocument()
  })

  it('should handle different models with different keys', () => {
    const { container, rerender } = render(
      <ModelProvider>
        <ModelViewer model={mockModel} side="left" />
      </ModelProvider>
    )

    const canvas1 = container.querySelector('[data-testid="canvas"]')
    expect(canvas1).toHaveAttribute('key', 'canvas-1-left')

    const mockModel2 = { ...mockModel, id: 2 }
    rerender(
      <ModelProvider>
        <ModelViewer model={mockModel2} side="left" />
      </ModelProvider>
    )

    const canvas2 = container.querySelector('[data-testid="canvas"]')
    expect(canvas2).toHaveAttribute('key', 'canvas-2-left')
  })
})
