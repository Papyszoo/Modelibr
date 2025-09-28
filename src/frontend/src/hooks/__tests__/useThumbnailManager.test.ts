import { renderHook } from '@testing-library/react'
import { useThumbnailManager } from '../useThumbnailManager'
import ApiClient from '../../services/ApiClient'

// Mock ApiClient
jest.mock('../../services/ApiClient', () => ({
  __esModule: true,
  default: {
    getThumbnailStatus: jest.fn(),
    getThumbnailUrl: jest.fn(),
    regenerateThumbnail: jest.fn(),
  },
}))

const mockApiClient = ApiClient as jest.Mocked<typeof ApiClient>

describe('useThumbnailManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApiClient.getThumbnailUrl.mockImplementation(
      (modelId: string) => `http://localhost:5009/models/${modelId}/thumbnail/file`
    )
  })

  it('generates thumbnail URL when status is Ready', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      Status: 'Ready',
      FileUrl: '/models/123/thumbnail/file',
      SizeBytes: 1024,
      Width: 256,
      Height: 256,
      ErrorMessage: null,
      CreatedAt: '2023-01-01T00:00:00Z',
      ProcessedAt: '2023-01-01T00:01:00Z',
    })

    const { result } = renderHook(() => useThumbnailManager('123'))

    // Wait for initial fetch
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.isReady).toBe(true)
    expect(result.current.thumbnailUrl).toBe('http://localhost:5009/models/123/thumbnail/file')
    expect(mockApiClient.getThumbnailUrl).toHaveBeenCalledWith('123')
  })

  it('does not generate thumbnail URL when status is not Ready', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      Status: 'Processing',
      FileUrl: null,
      SizeBytes: null,
      Width: null,
      Height: null,
      ErrorMessage: null,
      CreatedAt: '2023-01-01T00:00:00Z',
      ProcessedAt: null,
    })

    const { result } = renderHook(() => useThumbnailManager('123'))

    // Wait for initial fetch
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.isProcessing).toBe(true)
    expect(result.current.thumbnailUrl).toBe(null)
    expect(mockApiClient.getThumbnailUrl).not.toHaveBeenCalled()
  })

  it('generates thumbnail URL even when FileUrl is null but status is Ready', async () => {
    // This test verifies our fix: even if FileUrl is null, we should still generate the URL
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      Status: 'Ready',
      FileUrl: null, // This could happen if backend logic changes
      SizeBytes: 1024,
      Width: 256,
      Height: 256,
      ErrorMessage: null,
      CreatedAt: '2023-01-01T00:00:00Z',
      ProcessedAt: '2023-01-01T00:01:00Z',
    })

    const { result } = renderHook(() => useThumbnailManager('123'))

    // Wait for initial fetch
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.isReady).toBe(true)
    expect(result.current.thumbnailUrl).toBe('http://localhost:5009/models/123/thumbnail/file')
    expect(mockApiClient.getThumbnailUrl).toHaveBeenCalledWith('123')
  })
})