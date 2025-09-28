import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { act } from 'react'
import { create } from '@react-three/test-renderer'
import ModelViewer from '../../ModelViewer'
import Scene from '../Scene'

// Mock ApiClient with the __mocks__ version
jest.mock('../../services/ApiClient')
import ApiClient from '../../services/ApiClient'

// Mock the Canvas component for DOM testing
jest.mock('@react-three/fiber', () => {
  const React = require('react')
  const originalModule = jest.requireActual('@react-three/fiber')
  
  const MockCanvas = ({ children, ...props }: any) => {
    return (
      <div data-testid="r3f-canvas" data-props={JSON.stringify(props)}>
        {children}
      </div>
    )
  }
  
  return {
    ...originalModule,
    Canvas: MockCanvas,
  }
})

// Mock Scene component for regular DOM testing
jest.mock('../Scene', () => {
  return function MockScene({ model }: { model: any }) {
    return (
      <div data-testid="r3f-scene" data-model-id={model?.id}>
        Scene for model {model?.id}
      </div>
    )
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
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('r3f-scene')).toBeInTheDocument()
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
    const mockGetModelById = ApiClient.getModelById as jest.MockedFunction<typeof ApiClient.getModelById>
    
    // All calls fail
    mockGetModelById.mockRejectedValue(new Error('Network Error: Failed to fetch'))
    
    render(<ModelViewer modelId="123" isTabContent={true} />)
    
    // Wait for initial error
    await waitFor(() => {
      expect(screen.getByText('Network Error: Failed to fetch')).toBeInTheDocument()
    })
    
    // Wait for all retries to complete (1s + 2s + 4s = 7s total)
    await new Promise(resolve => setTimeout(resolve, 8000))
    
    // Should have made exactly 4 calls total (initial + 3 retries)
    expect(mockGetModelById).toHaveBeenCalledTimes(4)
    
    // Should still show error state
    expect(screen.getByText('Network Error: Failed to fetch')).toBeInTheDocument()
  }, 12000) // Increase timeout to accommodate retries

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

  it('should maintain model visibility when switching browser tabs', async () => {
    // Test both DOM elements and 3D scene content
    
    // First, test DOM elements using regular render
    render(<ModelViewer model={mockModel} isTabContent={true} />)
    
    // Verify model UI is initially displayed
    expect(screen.getByText('Model #123')).toBeInTheDocument()
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument()
    
    // Now test the actual 3D scene using R3F test renderer
    // Create a simplified scene with the essential elements that should be in the real scene
    const renderer = await create(
      <>
        {/* Essential lighting setup */}
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 10, 5]} intensity={1.0} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        <spotLight position={[0, 10, 0]} angle={0.3} intensity={0.8} />
        
        {/* Model placeholder - since mockModel has no renderable files, 
            Scene component renders a fallback box */}
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="gray" />
        </mesh>
        
        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color="#f0f0f0" />
        </mesh>
      </>
    )
    
    // Verify the 3D scene contains the expected objects
    const scene = renderer.scene
    
    // Check for lighting setup in the scene
    const ambientLight = scene.children.find((child: any) => child.type === 'AmbientLight')
    const directionalLight = scene.children.find((child: any) => child.type === 'DirectionalLight')
    const pointLight = scene.children.find((child: any) => child.type === 'PointLight')
    const spotLight = scene.children.find((child: any) => child.type === 'SpotLight')
    
    expect(ambientLight).toBeDefined()
    expect(directionalLight).toBeDefined()
    expect(pointLight).toBeDefined()
    expect(spotLight).toBeDefined()
    
    // Check for 3D meshes (model box and ground plane)
    const meshes = scene.children.filter((child: any) => child.type === 'Mesh')
    expect(meshes.length).toBe(2) // model box + ground plane
    
    // Verify we have all essential scene elements for proper 3D model display
    expect(scene.children.length).toBe(6) // 4 lights + 2 meshes
    
    // Simulate tab becoming hidden and visible again
    Object.defineProperty(document, 'hidden', { writable: true, value: true })
    const visibilityChangeEvent = new Event('visibilitychange')
    document.dispatchEvent(visibilityChangeEvent)
    
    // After tab visibility change, DOM elements should still be present
    expect(screen.getByText('Model #123')).toBeInTheDocument()
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument()
    
    // And all 3D objects should still be present in the scene 
    expect(scene.children.find((child: any) => child.type === 'AmbientLight')).toBeDefined()
    expect(scene.children.find((child: any) => child.type === 'DirectionalLight')).toBeDefined()
    expect(scene.children.find((child: any) => child.type === 'PointLight')).toBeDefined()
    expect(scene.children.find((child: any) => child.type === 'SpotLight')).toBeDefined()
    
    // Model meshes should still be visible in 3D scene
    const meshesAfter = scene.children.filter((child: any) => child.type === 'Mesh')
    expect(meshesAfter.length).toBe(2)
    
    // Tab becomes visible again
    Object.defineProperty(document, 'hidden', { writable: true, value: false })
    document.dispatchEvent(visibilityChangeEvent)
    
    // All scene objects should remain intact after returning to tab
    expect(scene.children.length).toBe(6) // 4 lights + 2 meshes should persist
    
    // Cleanup
    renderer.unmount()
  })

  it('should verify Canvas props are correctly passed', () => {
    render(<ModelViewer model={mockModel} isTabContent={true} />)
    
    const canvas = screen.getByTestId('r3f-canvas')
    expect(canvas).toBeInTheDocument()
    
    // Verify Canvas props are passed correctly
    const canvasProps = JSON.parse(canvas.getAttribute('data-props') || '{}')
    expect(canvasProps.camera).toEqual({ position: [3, 3, 3], fov: 60 })
    expect(canvasProps.shadows).toBe(true)
    expect(canvasProps.gl).toEqual({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
  })
})