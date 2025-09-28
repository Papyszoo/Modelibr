import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ThumbnailDisplay from '../ThumbnailDisplay'

// Mock the useThumbnailManager hook
jest.mock('../../hooks/useThumbnailManager', () => ({
  useThumbnailManager: jest.fn(),
  THUMBNAIL_STATUS: {
    PENDING: 'Pending',
    PROCESSING: 'Processing',
    READY: 'Ready',
    FAILED: 'Failed',
  },
}))

const { useThumbnailManager } = require('../../hooks/useThumbnailManager')

describe('ThumbnailDisplay', () => {
  beforeEach(() => {
    useThumbnailManager.mockReset()
  })

  it('renders loading state when processing', () => {
    useThumbnailManager.mockReturnValue({
      thumbnailStatus: { Status: 'Processing' },
      thumbnailUrl: null,
      isLoading: false,
      error: null,
      isProcessing: true,
      isReady: false,
      isFailed: false,
      regenerateThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId={1} />)

    expect(screen.getByLabelText('Loading thumbnail')).toBeInTheDocument()
    expect(screen.getByText('Generating thumbnail...')).toBeInTheDocument()
  })

  it('renders placeholder when no thumbnail status', () => {
    useThumbnailManager.mockReturnValue({
      thumbnailStatus: null,
      thumbnailUrl: null,
      isLoading: false,
      error: null,
      isProcessing: false,
      isReady: false,
      isFailed: false,
      regenerateThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId={1} />)

    expect(screen.getByLabelText('No thumbnail available')).toBeInTheDocument()
  })

  it('applies correct size classes', () => {
    useThumbnailManager.mockReturnValue({
      thumbnailStatus: null,
      thumbnailUrl: null,
      isLoading: false,
      error: null,
      isProcessing: false,
      isReady: false,
      isFailed: false,
      regenerateThumbnail: jest.fn(),
    })

    const { container } = render(<ThumbnailDisplay modelId={1} size="small" />)
    expect(container.firstChild).toHaveClass('thumbnail-small')
  })

  it('renders thumbnail image when ready', () => {
    useThumbnailManager.mockReturnValue({
      thumbnailStatus: { Status: 'Ready' },
      thumbnailUrl: 'http://localhost:5009/models/1/thumbnail/file',
      isLoading: false,
      error: null,
      isProcessing: false,
      isReady: true,
      isFailed: false,
      regenerateThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId={1} />)

    const image = screen.getByRole('img')
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', 'http://localhost:5009/models/1/thumbnail/file')
    expect(image).toHaveAttribute('alt', 'Thumbnail for model 1')
  })

  it('renders error state when failed', () => {
    useThumbnailManager.mockReturnValue({
      thumbnailStatus: { Status: 'Failed', ErrorMessage: 'Generation failed' },
      thumbnailUrl: null,
      isLoading: false,
      error: null,
      isProcessing: false,
      isReady: false,
      isFailed: true,
      regenerateThumbnail: jest.fn(),
    })

    render(<ThumbnailDisplay modelId={1} />)

    expect(screen.getByLabelText('Thumbnail failed to generate')).toBeInTheDocument()
    expect(screen.getByText('Generation failed')).toBeInTheDocument()
  })
})
