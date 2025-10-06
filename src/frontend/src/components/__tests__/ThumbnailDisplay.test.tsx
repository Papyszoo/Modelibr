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
})
