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
    FAILED: 'Failed'
  }
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
      regenerateThumbnail: jest.fn()
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
      regenerateThumbnail: jest.fn()
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
      regenerateThumbnail: jest.fn()
    })

    const { container } = render(<ThumbnailDisplay modelId={1} size="small" />)
    expect(container.firstChild).toHaveClass('thumbnail-small')
  })
})