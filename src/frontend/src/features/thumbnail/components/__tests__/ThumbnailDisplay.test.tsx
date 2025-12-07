import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ThumbnailDisplay from '../ThumbnailDisplay'
import ApiClient from '../../../../services/ApiClient'

// Mock ApiClient
jest.mock('../../../../services/ApiClient', () => ({
  __esModule: true,
  default: {
    getThumbnailStatus: jest.fn(),
    getThumbnailUrl: jest.fn(),
  },
}))

const mockApiClient = ApiClient as jest.Mocked<typeof ApiClient>

describe('ThumbnailDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

    mockApiClient.getThumbnailUrl.mockReturnValue(
      'http://localhost:5009/models/1/thumbnail/file'
    )

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute(
        'src',
        'http://localhost:5009/models/1/thumbnail/file'
      )
    })
  })

  it('renders placeholder when thumbnail status is not Ready', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Failed',
    } as any)

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      expect(
        screen.getByLabelText('No thumbnail available')
      ).toBeInTheDocument()
    })
  })

  it('does not continuously fetch thumbnail status when displayed', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Ready',
    } as any)

    mockApiClient.getThumbnailUrl.mockReturnValue(
      'http://localhost:5009/models/1/thumbnail/file'
    )

    render(<ThumbnailDisplay modelId="1" />)

    // Wait for the image to be rendered
    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
    })

    // Verify getThumbnailStatus was called exactly once
    expect(mockApiClient.getThumbnailStatus).toHaveBeenCalledTimes(1)
    expect(mockApiClient.getThumbnailStatus).toHaveBeenCalledWith('1')

    // Wait a bit more to ensure no additional calls are made
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify it's still only called once (no infinite loop)
    expect(mockApiClient.getThumbnailStatus).toHaveBeenCalledTimes(1)
  })

  it('uses direct URL for browser caching instead of fetching blob', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Ready',
      fileUrl: '/models/1/thumbnail/file',
    } as any)

    mockApiClient.getThumbnailUrl.mockReturnValue(
      'http://localhost:5009/models/1/thumbnail/file'
    )

    render(<ThumbnailDisplay modelId="1" />)

    // Wait for initial render
    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute(
        'src',
        'http://localhost:5009/models/1/thumbnail/file'
      )
    })

    // Verify getThumbnailUrl was called
    expect(mockApiClient.getThumbnailUrl).toHaveBeenCalledTimes(1)
    expect(mockApiClient.getThumbnailUrl).toHaveBeenCalledWith('1')
  })

  it('uses model name in alt text and title when provided', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Ready',
    } as any)

    mockApiClient.getThumbnailUrl.mockReturnValue(
      'http://localhost:5009/models/1/thumbnail/file'
    )

    render(<ThumbnailDisplay modelId="1" modelName="Sci-Fi Spaceship" />)

    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute('alt', 'Sci-Fi Spaceship')
      expect(image).toHaveAttribute('title', 'Sci-Fi Spaceship')
    })
  })

  it('uses default alt text when model name is not provided', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({
      status: 'Ready',
    } as any)

    mockApiClient.getThumbnailUrl.mockReturnValue(
      'http://localhost:5009/models/1/thumbnail/file'
    )

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute('alt', 'Model Thumbnail')
    })
  })
})
