import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ModelGrid from '../ModelGrid'
import { Model } from '../../../utils/fileUtils'
import ApiClient from '../../../services/ApiClient'

// Mock ApiClient for ThumbnailDisplay component
jest.mock('../../../services/ApiClient', () => ({
  __esModule: true,
  default: {
    getThumbnailStatus: jest.fn(),
    getThumbnailFile: jest.fn(),
  },
}))

const mockApiClient = ApiClient as jest.Mocked<typeof ApiClient>

const mockModels: Model[] = [
  {
    id: '1',
    name: 'Model 1',
    createdAt: new Date('2024-01-01').toISOString(),
    files: [
      {
        id: '1',
        originalFileName: 'model1.obj',
        storedFileName: 'stored1.obj',
        sizeBytes: 1000,
        hash: 'hash1',
        uploadedAt: new Date('2024-01-01').toISOString(),
      },
    ],
  },
  {
    id: '2',
    name: 'Model 2',
    createdAt: new Date('2024-01-02').toISOString(),
    files: [
      {
        id: '2',
        originalFileName: 'model2.glb',
        storedFileName: 'stored2.glb',
        sizeBytes: 2000,
        hash: 'hash2',
        uploadedAt: new Date('2024-01-02').toISOString(),
      },
    ],
  },
  {
    id: '3',
    name: 'Test Model',
    createdAt: new Date('2024-01-03').toISOString(),
    files: [
      {
        id: '3',
        originalFileName: 'test.gltf',
        storedFileName: 'stored3.gltf',
        sizeBytes: 3000,
        hash: 'hash3',
        uploadedAt: new Date('2024-01-03').toISOString(),
      },
    ],
  },
]

describe('ModelGrid', () => {
  const mockOnModelSelect = jest.fn()
  const mockOnDrop = jest.fn()
  const mockOnDragOver = jest.fn()
  const mockOnDragEnter = jest.fn()
  const mockOnDragLeave = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Processing',
    } as any)
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = jest.fn()
  })

  it('renders search bar and filter placeholder', () => {
    render(
      <ModelGrid
        models={mockModels}
        onModelSelect={mockOnModelSelect}
        onDrop={mockOnDrop}
        onDragOver={mockOnDragOver}
        onDragEnter={mockOnDragEnter}
        onDragLeave={mockOnDragLeave}
      />
    )

    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument()
    expect(screen.getByText('Filters (Coming Soon)')).toBeInTheDocument()
  })

  it('renders all models in grid', () => {
    render(
      <ModelGrid
        models={mockModels}
        onModelSelect={mockOnModelSelect}
        onDrop={mockOnDrop}
        onDragOver={mockOnDragOver}
        onDragEnter={mockOnDragEnter}
        onDragLeave={mockOnDragLeave}
      />
    )

    expect(screen.getByText('model1.obj')).toBeInTheDocument()
    expect(screen.getByText('model2.glb')).toBeInTheDocument()
    expect(screen.getByText('test.gltf')).toBeInTheDocument()
  })

  it('filters models based on search query', () => {
    render(
      <ModelGrid
        models={mockModels}
        onModelSelect={mockOnModelSelect}
        onDrop={mockOnDrop}
        onDragOver={mockOnDragOver}
        onDragEnter={mockOnDragEnter}
        onDragLeave={mockOnDragLeave}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search models...')
    fireEvent.change(searchInput, { target: { value: 'test' } })

    expect(screen.getByText('test.gltf')).toBeInTheDocument()
    expect(screen.queryByText('model1.obj')).not.toBeInTheDocument()
    expect(screen.queryByText('model2.glb')).not.toBeInTheDocument()
  })

  it('shows no results message when search has no matches', () => {
    render(
      <ModelGrid
        models={mockModels}
        onModelSelect={mockOnModelSelect}
        onDrop={mockOnDrop}
        onDragOver={mockOnDragOver}
        onDragEnter={mockOnDragEnter}
        onDragLeave={mockOnDragLeave}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search models...')
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

    expect(
      screen.getByText('No models found matching "nonexistent"')
    ).toBeInTheDocument()
  })

  it('calls onModelSelect when a card is clicked', () => {
    render(
      <ModelGrid
        models={mockModels}
        onModelSelect={mockOnModelSelect}
        onDrop={mockOnDrop}
        onDragOver={mockOnDragOver}
        onDragEnter={mockOnDragEnter}
        onDragLeave={mockOnDragLeave}
      />
    )

    const modelCard = screen.getByText('model1.obj').closest('.model-card')
    expect(modelCard).toBeInTheDocument()

    fireEvent.click(modelCard!)
    expect(mockOnModelSelect).toHaveBeenCalledWith(mockModels[0])
  })

  it('handles drag and drop events', () => {
    render(
      <ModelGrid
        models={mockModels}
        onModelSelect={mockOnModelSelect}
        onDrop={mockOnDrop}
        onDragOver={mockOnDragOver}
        onDragEnter={mockOnDragEnter}
        onDragLeave={mockOnDragLeave}
      />
    )

    const container = document.querySelector('.model-grid-container')
    expect(container).toBeInTheDocument()

    const mockEvent = {
      preventDefault: jest.fn(),
    } as unknown as React.DragEvent

    fireEvent.dragOver(container!, mockEvent)
    expect(mockOnDragOver).toHaveBeenCalled()

    fireEvent.dragEnter(container!, mockEvent)
    expect(mockOnDragEnter).toHaveBeenCalled()

    fireEvent.dragLeave(container!, mockEvent)
    expect(mockOnDragLeave).toHaveBeenCalled()

    fireEvent.drop(container!, mockEvent)
    expect(mockOnDrop).toHaveBeenCalled()
  })

  it('is case-insensitive when searching', () => {
    render(
      <ModelGrid
        models={mockModels}
        onModelSelect={mockOnModelSelect}
        onDrop={mockOnDrop}
        onDragOver={mockOnDragOver}
        onDragEnter={mockOnDragEnter}
        onDragLeave={mockOnDragLeave}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search models...')
    fireEvent.change(searchInput, { target: { value: 'TEST' } })

    expect(screen.getByText('test.gltf')).toBeInTheDocument()
  })
})
