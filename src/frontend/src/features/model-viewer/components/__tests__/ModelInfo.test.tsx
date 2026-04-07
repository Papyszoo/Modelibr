import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import { ModelInfo } from '@/features/model-viewer/components/ModelInfo'

jest.mock('@/features/models/api/modelApi', () => ({
  addModelConceptImage: jest.fn(),
  getFilePreviewUrl: jest.fn(fileId => `/files/${fileId}/preview`),
  getFileUrl: jest.fn(fileId => `/files/${fileId}`),
  removeModelConceptImage: jest.fn(),
  updateModelTags: jest.fn(),
  uploadFile: jest.fn(),
}))

jest.mock('@/features/models/api/queries', () => ({
  useModelCategoriesQuery: jest.fn(() => ({ data: [] })),
}))

jest.mock('@/lib/apiBase', () => ({
  resolveApiAssetUrl: (url?: string | null) => url ?? null,
}))

describe('ModelInfo', () => {
  const renderWithQueryClient = (ui: ReactElement) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    )
  }

  const mockModel = {
    id: 'test-model-123',
    name: 'Test Model',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-16T14:45:00Z',
    files: [{ originalFileName: 'test-model.obj' }],
    tags: [],
    description: '',
    textureSets: [],
  }

  it('should render model information correctly', () => {
    renderWithQueryClient(<ModelInfo model={mockModel} />)

    // Check if model information is displayed
    expect(screen.getByText('test-model-123')).toBeInTheDocument()
    expect(screen.getByText('OBJ')).toBeInTheDocument()
  })

  it('should format dates correctly', () => {
    renderWithQueryClient(<ModelInfo model={mockModel} />)

    // Check if dates are formatted (will depend on locale)
    const createdDate = new Date(mockModel.createdAt).toLocaleString()
    const updatedDate = new Date(mockModel.updatedAt).toLocaleString()

    expect(screen.getByText(createdDate)).toBeInTheDocument()
    expect(screen.getByText(updatedDate)).toBeInTheDocument()
  })

  it('should display Tags & Description section', () => {
    renderWithQueryClient(<ModelInfo model={mockModel} />)

    expect(screen.getByPlaceholderText('Add new tag...')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Enter description...')
    ).toBeInTheDocument()
  })

  it('should handle model without files', () => {
    const modelWithoutFiles = {
      ...mockModel,
      id: 'test-model-456',
      files: [],
    }

    renderWithQueryClient(<ModelInfo model={modelWithoutFiles} />)

    expect(screen.getByText('test-model-456')).toBeInTheDocument()
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
  })

  it('should handle model with multiple files', () => {
    const modelWithMultipleFiles = {
      ...mockModel,
      id: 'test-model-789',
      files: [
        { originalFileName: 'model.gltf' },
        { originalFileName: 'texture.jpg' },
      ],
    }

    renderWithQueryClient(<ModelInfo model={modelWithMultipleFiles} />)

    // Should show format of first file
    expect(screen.getByText('GLTF')).toBeInTheDocument()
  })

  it('should render required sections', () => {
    renderWithQueryClient(<ModelInfo model={mockModel} />)

    // Check that info grid and tags section are present
    expect(screen.getByText('test-model-123')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add new tag...')).toBeInTheDocument()
  })

  it('should display model tags when provided', () => {
    const modelWithTags = {
      ...mockModel,
      tags: ['character', 'sci-fi', 'robot'],
    }

    renderWithQueryClient(<ModelInfo model={modelWithTags} />)

    expect(screen.getByText('character')).toBeInTheDocument()
    expect(screen.getByText('sci-fi')).toBeInTheDocument()
    expect(screen.getByText('robot')).toBeInTheDocument()
  })

  it('should display save button', () => {
    renderWithQueryClient(<ModelInfo model={mockModel} />)

    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })

  it('opens concept images in the lightbox viewer', () => {
    const modelWithConceptImage = {
      ...mockModel,
      conceptImages: [
        {
          fileId: 7,
          fileName: 'concept-sheet.png',
          previewUrl: '/concept-preview.png',
          fileUrl: '/concept-full.png',
          sortOrder: 0,
        },
      ],
    }

    renderWithQueryClient(<ModelInfo model={modelWithConceptImage} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open concept image concept-sheet.png',
      })
    )

    expect(screen.getByAltText('concept-sheet.png full view')).toHaveAttribute(
      'src',
      '/concept-full.png'
    )
  })
})
