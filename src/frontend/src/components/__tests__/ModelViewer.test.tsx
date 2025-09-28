import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { act } from 'react'
import ModelViewer from '../../ModelViewer'

// Mock ApiClient with the __mocks__ version
jest.mock('../../services/ApiClient')
import ApiClient from '../../services/ApiClient'

// Mock Canvas component to avoid Three.js issues in tests
jest.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
}))

// Mock Scene component
jest.mock('../Scene', () => {
  return function MockScene({ model }: { model: any }) {
    return <div data-testid="scene">Scene for model {model?.id}</div>
  }
})

// Mock other components
jest.mock('../ModelInfo', () => {
  return function MockModelInfo({ model }: { model: any }) {
    return <div data-testid="model-info">Model Info for {model?.id}</div>
  }
})

jest.mock('../ThumbnailDisplay', () => {
  return function MockThumbnailDisplay({ modelId }: { modelId: string }) {
    return <div data-testid="thumbnail">Thumbnail for {modelId}</div>
  }
})

const mockModel = {
  id: '123',
  name: 'Test Model',
  files: [{
    id: '1',
    originalFileName: 'test.obj',
    storedFileName: 'stored.obj',
    filePath: '/path/to/file',
    mimeType: 'model/obj',
    sizeBytes: 1024,
    sha256Hash: 'hash',
    fileType: 'obj',
    isRenderable: true,
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01'
  }],
  createdAt: '2023-01-01',
  updatedAt: '2023-01-01'
}

describe('ModelViewer - Tab Switching Issue Fix', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset document visibility API mock
    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: false
    })
  })

  afterEach(() => {
    // Clean up any pending timers
    jest.clearAllTimers()
  })

  it('should render model when passed as prop', () => {
    render(<ModelViewer model={mockModel} isTabContent={true} />)
    
    expect(screen.getByText('Model #123')).toBeInTheDocument()
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    expect(screen.getByTestId('model-info')).toBeInTheDocument()
  })

  it('should fetch model by ID when modelId is provided', async () => {
    const mockGetModelById = ApiClient.getModelById as jest.MockedFunction<typeof ApiClient.getModelById>
    mockGetModelById.mockResolvedValueOnce(mockModel)
    
    render(<ModelViewer modelId="123" isTabContent={true} />)
    
    expect(screen.getByText('Loading model...')).toBeInTheDocument()
    
    await waitFor(() => {
      expect(screen.getByText('Model #123')).toBeInTheDocument()
    })
    
    expect(mockGetModelById).toHaveBeenCalledWith('123')
  })

  it('should show error state when API call fails', async () => {
    const mockGetModelById = ApiClient.getModelById as jest.MockedFunction<typeof ApiClient.getModelById>
    mockGetModelById.mockRejectedValueOnce(new Error('Network Error: Failed to fetch'))
    
    render(<ModelViewer modelId="123" isTabContent={true} />)
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load model')).toBeInTheDocument()
      expect(screen.getByText('Network Error: Failed to fetch')).toBeInTheDocument()
    })
  })

  it('should implement auto-retry mechanism for network errors', async () => {
    jest.useFakeTimers()
    const mockGetModelById = ApiClient.getModelById as jest.MockedFunction<typeof ApiClient.getModelById>
    
    // First call fails
    mockGetModelById
      .mockRejectedValueOnce(new Error('Network Error: Failed to fetch'))
      .mockResolvedValueOnce(mockModel)
    
    render(<ModelViewer modelId="123" isTabContent={true} />)
    
    // Wait for initial error
    await waitFor(() => {
      expect(screen.getByText('Network Error: Failed to fetch')).toBeInTheDocument()
    })
    
    // Should show retry info
    expect(screen.getByText('Retrying... (attempt 1/3)')).toBeInTheDocument()
    
    // Fast-forward time to trigger retry
    act(() => {
      jest.advanceTimersByTime(1000) // 1 second delay for first retry
    })
    
    // Should eventually succeed
    await waitFor(() => {
      expect(screen.getByText('Model #123')).toBeInTheDocument()
    })
    
    expect(mockGetModelById).toHaveBeenCalledTimes(2)
    
    jest.useRealTimers()
  })

  it('should handle visibility change when tab becomes active again', async () => {
    const mockGetModelById = ApiClient.getModelById as jest.MockedFunction<typeof ApiClient.getModelById>
    
    // Start with a failed API call
    mockGetModelById.mockRejectedValueOnce(new Error('Network Error: Failed to fetch'))
    
    render(<ModelViewer modelId="123" isTabContent={true} />)
    
    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText('Network Error: Failed to fetch')).toBeInTheDocument()
    })
    
    // Setup successful retry
    mockGetModelById.mockResolvedValueOnce(mockModel)
    
    // Simulate tab becoming visible again
    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: false
    })
    
    act(() => {
      const event = new Event('visibilitychange')
      document.dispatchEvent(event)
    })
    
    // Should retry and succeed
    await waitFor(() => {
      expect(screen.getByText('Model #123')).toBeInTheDocument()
    })
    
    expect(mockGetModelById).toHaveBeenCalledTimes(2)
  })

  it('should allow manual retry when retry button is clicked', async () => {
    const mockGetModelById = ApiClient.getModelById as jest.MockedFunction<typeof ApiClient.getModelById>
    
    // First call fails
    mockGetModelById
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce(mockModel)
    
    render(<ModelViewer modelId="123" isTabContent={true} />)
    
    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument()
    })
    
    // Click retry button
    const retryButton = screen.getByText('Retry')
    fireEvent.click(retryButton)
    
    // Should eventually succeed
    await waitFor(() => {
      expect(screen.getByText('Model #123')).toBeInTheDocument()
    })
    
    expect(mockGetModelById).toHaveBeenCalledTimes(2)
  })

  it('should stop auto-retrying after 3 attempts', async () => {
    jest.useFakeTimers()
    const mockGetModelById = ApiClient.getModelById as jest.MockedFunction<typeof ApiClient.getModelById>
    
    // All calls fail
    mockGetModelById.mockRejectedValue(new Error('Network Error: Failed to fetch'))
    
    render(<ModelViewer modelId="123" isTabContent={true} />)
    
    // Wait for initial error
    await waitFor(() => {
      expect(screen.getByText('Network Error: Failed to fetch')).toBeInTheDocument()
    })
    
    // Fast-forward through multiple retry attempts
    act(() => {
      jest.advanceTimersByTime(10000) // Fast forward through all retries
    })
    
    // Should have made multiple retry attempts
    expect(mockGetModelById).toHaveBeenCalledTimes(4) // initial + 3 retries
    
    // Should still show error 
    expect(screen.getByText('Network Error: Failed to fetch')).toBeInTheDocument()
    
    jest.useRealTimers()
  })

  it('should not retry for non-network errors', async () => {
    jest.useFakeTimers()
    const mockGetModelById = ApiClient.getModelById as jest.MockedFunction<typeof ApiClient.getModelById>
    
    // Non-network error
    mockGetModelById.mockRejectedValueOnce(new Error('Model not found'))
    
    render(<ModelViewer modelId="123" isTabContent={true} />)
    
    await waitFor(() => {
      expect(screen.getByText('Model not found')).toBeInTheDocument()
    })
    
    // Should not show retry info
    expect(screen.queryByText(/Retrying/)).not.toBeInTheDocument()
    
    // Fast-forward time - should not retry
    act(() => {
      jest.advanceTimersByTime(5000)
    })
    
    expect(mockGetModelById).toHaveBeenCalledTimes(1)
    
    jest.useRealTimers()
  })
})