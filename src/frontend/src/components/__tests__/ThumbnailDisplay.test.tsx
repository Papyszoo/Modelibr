import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ThumbnailDisplay from '../ThumbnailDisplay'
import ApiClient from '../../services/ApiClient'

// Mock ApiClient
jest.mock('../../services/ApiClient', () => ({
  __esModule: true,
  default: {
    getThumbnailStatus: jest.fn(),
    getThumbnailFile: jest.fn(),
  },
}))

const mockApiClient = ApiClient as jest.Mocked<typeof ApiClient>

describe('ThumbnailDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = jest.fn()
  })

  it('renders placeholder when thumbnail is not ready', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Processing',
    } as any)

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      expect(
        screen.getByLabelText('No thumbnail available')
      ).toBeInTheDocument()
    })
  })

  it('renders thumbnail image when ready', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Ready',
    } as any)

    const mockBlob = new Blob(['test'], { type: 'image/webp' })
    mockApiClient.getThumbnailFile.mockResolvedValue(mockBlob)

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute('alt', 'Model Thumbnail')
    })
  })

  it('renders placeholder when thumbnail fetch fails', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Ready',
    } as any)

    mockApiClient.getThumbnailFile.mockRejectedValue(new Error('Fetch failed'))

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      expect(
        screen.getByLabelText('No thumbnail available')
      ).toBeInTheDocument()
    })
  })

  it('does not continuously fetch thumbnail file when displayed', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Ready',
    } as any)

    const mockBlob = new Blob(['test'], { type: 'image/webp' })
    mockApiClient.getThumbnailFile.mockResolvedValue(mockBlob)

    render(<ThumbnailDisplay modelId="1" />)

    // Wait for the image to be rendered
    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
    })

    // Verify getThumbnailFile was called exactly once
    expect(mockApiClient.getThumbnailFile).toHaveBeenCalledTimes(1)
    expect(mockApiClient.getThumbnailFile).toHaveBeenCalledWith('1')

    // Wait a bit more to ensure no additional calls are made
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify it's still only called once (no infinite loop)
    expect(mockApiClient.getThumbnailFile).toHaveBeenCalledTimes(1)
  })

  it('does not refetch when thumbnail details object changes but status stays Ready', async () => {
    // First response with Ready status
    mockApiClient.getThumbnailStatus.mockResolvedValueOnce({
      status: 'Ready',
      fileUrl: '/models/1/thumbnail/file',
    } as any)

    const mockBlob = new Blob(['test'], { type: 'image/webp' })
    mockApiClient.getThumbnailFile.mockResolvedValue(mockBlob)

    const { rerender } = render(<ThumbnailDisplay modelId="1" />)

    // Wait for initial render
    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
    })

    // Verify initial fetch
    expect(mockApiClient.getThumbnailFile).toHaveBeenCalledTimes(1)

    // Simulate a new thumbnailDetails object with same status (e.g., from SignalR update)
    mockApiClient.getThumbnailStatus.mockResolvedValueOnce({
      status: 'Ready',
      fileUrl: '/models/1/thumbnail/file',
      updatedAt: new Date().toISOString(), // Different timestamp
    } as any)

    // Force a re-render
    rerender(<ThumbnailDisplay modelId="1" />)

    await new Promise(resolve => setTimeout(resolve, 100))

    // Should still be called only once - status didn't change
    expect(mockApiClient.getThumbnailFile).toHaveBeenCalledTimes(1)
  })
})
