import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ModelGrid from '@/features/models/components/ModelGrid/ModelGrid'

// Mock useTabContext
const mockOpenModelDetailsTab = jest.fn()
jest.mock('../../../../../hooks/useTabContext', () => ({
  useTabContext: () => ({
    openModelDetailsTab: mockOpenModelDetailsTab,
  }),
}))

// Mock useModelGrid hook to control component state
const mockFetchModels = jest.fn()
const mockHandleModelRecycled = jest.fn()
const mockSetSearchQuery = jest.fn()
const mockHandlePackFilterChange = jest.fn()
const mockHandleProjectFilterChange = jest.fn()
const mockHandleCardWidthChange = jest.fn()
const mockOnDrop = jest.fn()
const mockOnDragOver = jest.fn()
const mockOnDragEnter = jest.fn()
const mockOnDragLeave = jest.fn()

const defaultHookReturn = {
  filteredModels: [],
  loading: false,
  error: '',
  packs: [],
  projects: [],
  pagination: {
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
    hasMore: false,
  },
  isLoadingMore: false,
  uploading: false,
  uploadProgress: 0,
  onDrop: mockOnDrop,
  onDragOver: mockOnDragOver,
  onDragEnter: mockOnDragEnter,
  onDragLeave: mockOnDragLeave,
  searchQuery: '',
  setSearchQuery: mockSetSearchQuery,
  effectivePackIds: [],
  effectiveProjectIds: [],
  handlePackFilterChange: mockHandlePackFilterChange,
  handleProjectFilterChange: mockHandleProjectFilterChange,
  packFilterDisabled: false,
  projectFilterDisabled: false,
  cardWidth: 200,
  handleCardWidthChange: mockHandleCardWidthChange,
  fetchModels: mockFetchModels,
  handleModelRecycled: mockHandleModelRecycled,
  getModelName: (model: { name: string }) => model.name,
  buildPathPrefix: () => '',
  toast: { current: null },
}

let mockHookReturn = { ...defaultHookReturn }

jest.mock('../useModelGrid', () => ({
  useModelGrid: () => mockHookReturn,
}))

// Mock PrimeReact Toast
jest.mock('primereact/toast', () => ({
  Toast: () => null,
}))

// Mock ModelContextMenu
jest.mock('../ModelContextMenu', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: React.forwardRef(() => null),
  }
})

// Mock ModelsFilters
jest.mock('../ModelsFilters', () => ({
  __esModule: true,
  default: ({
    searchQuery,
    onSearchChange,
  }: {
    searchQuery: string
    onSearchChange: (v: string) => void
  }) => (
    <input
      placeholder="Search models..."
      value={searchQuery}
      onChange={(e: any) => onSearchChange(e.target.value)}
    />
  ),
}))

// Mock ThumbnailDisplay
jest.mock('../../../../thumbnail', () => ({
  ThumbnailDisplay: () => <div data-testid="thumbnail" />,
}))

describe('ModelGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHookReturn = { ...defaultHookReturn }
  })

  it('renders loading state', () => {
    mockHookReturn = { ...defaultHookReturn, loading: true }
    render(<ModelGrid />)
    expect(screen.getByText('Loading models...')).toBeInTheDocument()
  })

  it('renders error state with retry button', () => {
    mockHookReturn = { ...defaultHookReturn, error: 'Failed to load' }
    render(<ModelGrid />)
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Retry'))
    expect(mockFetchModels).toHaveBeenCalled()
  })

  it('renders empty state when no models', () => {
    render(<ModelGrid />)
    expect(
      screen.getByText('No models found. Drag & drop files here to upload.')
    ).toBeInTheDocument()
  })

  it('renders model cards', () => {
    mockHookReturn = {
      ...defaultHookReturn,
      filteredModels: [
        { id: '1', name: 'Model 1', files: [], createdAt: '', updatedAt: '' },
        { id: '2', name: 'Model 2', files: [], createdAt: '', updatedAt: '' },
      ] as any,
    }
    render(<ModelGrid />)
    expect(screen.getByText('Model 1')).toBeInTheDocument()
    expect(screen.getByText('Model 2')).toBeInTheDocument()
  })

  it('calls openModelDetailsTab when a card is clicked', () => {
    mockHookReturn = {
      ...defaultHookReturn,
      filteredModels: [
        {
          id: '1',
          name: 'Test Model',
          files: [],
          createdAt: '',
          updatedAt: '',
        },
      ] as any,
    }
    render(<ModelGrid />)

    const card = screen.getByText('Test Model').closest('.model-card')
    fireEvent.click(card!)
    expect(mockOpenModelDetailsTab).toHaveBeenCalledWith('1', 'Test Model')
  })

  it('shows upload progress bar when uploading', () => {
    mockHookReturn = {
      ...defaultHookReturn,
      uploading: true,
      uploadProgress: 50,
    }
    render(<ModelGrid />)
    expect(screen.getByText('Uploading files...')).toBeInTheDocument()
  })

  it('shows Load More button when hasMore is true', () => {
    mockHookReturn = {
      ...defaultHookReturn,
      filteredModels: [
        { id: '1', name: 'Model 1', files: [], createdAt: '', updatedAt: '' },
      ] as any,
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 100,
        totalPages: 2,
        hasMore: true,
      },
    }
    render(<ModelGrid />)

    const loadMoreBtn = screen.getByText('Load More (1 of 100)')
    fireEvent.click(loadMoreBtn)
    expect(mockFetchModels).toHaveBeenCalledWith(true)
  })

  it('passes packId and projectId props to useModelGrid', () => {
    render(<ModelGrid packId={5} projectId={10} />)
    // When in pack/project context with no models, shows "Add Model" card instead of empty state
    expect(screen.getByText('Add Model')).toBeInTheDocument()
  })

  it('shows search no-results message when searchQuery is set', () => {
    mockHookReturn = {
      ...defaultHookReturn,
      searchQuery: 'nonexistent',
    }
    render(<ModelGrid />)
    expect(
      screen.getByText('No models found matching "nonexistent"')
    ).toBeInTheDocument()
  })
})
