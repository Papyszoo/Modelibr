import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ThumbnailDisplay from '@/features/thumbnail/components/ThumbnailDisplay'

// Mock the useThumbnail hook directly
const mockUseThumbnail = jest.fn()
jest.mock('../../hooks/useThumbnail', () => ({
  useThumbnail: (...args: unknown[]) => mockUseThumbnail(...args),
}))

describe('ThumbnailDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders placeholder when thumbnail is not ready', async () => {
    mockUseThumbnail.mockReturnValue({
      thumbnailDetails: { status: 'Processing' },
      imgSrc: null,
      refreshThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      expect(
        screen.getByLabelText('No thumbnail available')
      ).toBeInTheDocument()
    })
  })

  it('renders thumbnail image when ready', async () => {
    mockUseThumbnail.mockReturnValue({
      thumbnailDetails: { status: 'Ready' },
      imgSrc: 'http://localhost:8080/models/1/thumbnail/file?t=123',
      refreshThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute(
        'src',
        'http://localhost:8080/models/1/thumbnail/file?t=123'
      )
    })
  })

  it('renders placeholder when thumbnail status is not Ready', async () => {
    mockUseThumbnail.mockReturnValue({
      thumbnailDetails: { status: 'Failed' },
      imgSrc: null,
      refreshThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      expect(
        screen.getByLabelText('No thumbnail available')
      ).toBeInTheDocument()
    })
  })

  it('calls useThumbnail with correct parameters', async () => {
    mockUseThumbnail.mockReturnValue({
      thumbnailDetails: { status: 'Ready' },
      imgSrc: 'http://localhost:8080/models/1/thumbnail/file?t=123',
      refreshThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      expect(mockUseThumbnail).toHaveBeenCalledWith('1', undefined)
    })
  })

  it('calls useThumbnail with versionId when provided', async () => {
    mockUseThumbnail.mockReturnValue({
      thumbnailDetails: { status: 'Ready' },
      imgSrc: 'http://localhost:8080/model-versions/5/thumbnail/file?t=123',
      refreshThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId="1" versionId={5} />)

    await waitFor(() => {
      expect(mockUseThumbnail).toHaveBeenCalledWith('1', 5)
    })
  })

  it('uses model name in alt text and title when provided', async () => {
    mockUseThumbnail.mockReturnValue({
      thumbnailDetails: { status: 'Ready' },
      imgSrc: 'http://localhost:8080/models/1/thumbnail/file?t=123',
      refreshThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId="1" modelName="Sci-Fi Spaceship" />)

    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute('alt', 'Sci-Fi Spaceship')
      expect(image).toHaveAttribute('title', 'Sci-Fi Spaceship')
    })
  })

  it('uses default alt text when model name is not provided', async () => {
    mockUseThumbnail.mockReturnValue({
      thumbnailDetails: { status: 'Ready' },
      imgSrc: 'http://localhost:8080/models/1/thumbnail/file?t=123',
      refreshThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId="1" />)

    await waitFor(() => {
      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute('alt', 'Model Thumbnail')
    })
  })
})
