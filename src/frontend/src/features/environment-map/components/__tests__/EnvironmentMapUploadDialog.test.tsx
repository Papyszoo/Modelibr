import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EnvironmentMapUploadDialog } from '@/features/environment-map/components/EnvironmentMapUploadDialog'

// Mock the upload utility that reads image dimensions (async/canvas-based)
jest.mock('@/features/environment-map/utils/environmentMapUploadUtils', () => ({
  getCubeFaceUploadName: jest.fn(() => 'cube-map'),
  getDroppedCubeFaceFiles: jest.fn(() => ({})),
  inferEnvironmentMapSizeLabel: jest.fn(() => Promise.resolve(null)),
}))

describe('EnvironmentMapUploadDialog', () => {
  const defaultProps = {
    visible: true,
    title: 'Upload Environment Map',
    submitLabel: 'Upload',
    onHide: jest.fn(),
    onSubmit: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the name field in create mode', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} mode="create" />)

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('does not render the name field in variant mode', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} mode="variant" />)

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('renders the dialog title and submit button label', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} />)

    expect(screen.getByText('Upload Environment Map')).toBeInTheDocument()
    expect(screen.getByText('Upload')).toBeInTheDocument()
  })

  it('renders the cancel button', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} />)

    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onHide when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onHide = jest.fn()

    render(<EnvironmentMapUploadDialog {...defaultProps} onHide={onHide} />)

    await user.click(screen.getByText('Cancel'))

    expect(onHide).toHaveBeenCalled()
  })

  it('shows validation error for empty name in create mode on submit', async () => {
    const user = userEvent.setup()

    render(<EnvironmentMapUploadDialog {...defaultProps} mode="create" />)

    // The name field starts empty — click upload to trigger validation
    await user.click(screen.getByText('Upload'))

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
    })
  })

  it('renders Panorama and Cube Faces source mode buttons', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} />)

    expect(screen.getByText('Panorama')).toBeInTheDocument()
    expect(screen.getByText('Cube Faces')).toBeInTheDocument()
  })

  it('defaults to single (Panorama) source mode', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} />)

    // In single mode, we should see the file chooser for a single file
    expect(screen.getByText('Environment Map File')).toBeInTheDocument()
    expect(screen.queryByText('Cube Face Mapping')).not.toBeInTheDocument()
  })

  it('switches to cube mode and shows cube face grid', async () => {
    const user = userEvent.setup()

    render(<EnvironmentMapUploadDialog {...defaultProps} />)

    await user.click(screen.getByText('Cube Faces'))

    await waitFor(() => {
      expect(screen.getByText('Cube Face Mapping')).toBeInTheDocument()
    })

    // All six cube face labels should be visible
    expect(screen.getByText('PX')).toBeInTheDocument()
    expect(screen.getByText('NX')).toBeInTheDocument()
    expect(screen.getByText('PY')).toBeInTheDocument()
    expect(screen.getByText('NY')).toBeInTheDocument()
    expect(screen.getByText('PZ')).toBeInTheDocument()
    expect(screen.getByText('NZ')).toBeInTheDocument()
  })

  it('shows cube face descriptions in cube mode', async () => {
    const user = userEvent.setup()

    render(<EnvironmentMapUploadDialog {...defaultProps} />)

    await user.click(screen.getByText('Cube Faces'))

    await waitFor(() => {
      expect(screen.getByText('Positive X / Right')).toBeInTheDocument()
      expect(screen.getByText('Negative X / Left')).toBeInTheDocument()
      expect(screen.getByText('Positive Y / Top')).toBeInTheDocument()
      expect(screen.getByText('Negative Y / Bottom')).toBeInTheDocument()
      expect(screen.getByText('Positive Z / Front')).toBeInTheDocument()
      expect(screen.getByText('Negative Z / Back')).toBeInTheDocument()
    })
  })

  it('switches back from cube mode to single mode', async () => {
    const user = userEvent.setup()

    render(<EnvironmentMapUploadDialog {...defaultProps} />)

    // Switch to cube
    await user.click(screen.getByText('Cube Faces'))
    expect(screen.getByText('Cube Face Mapping')).toBeInTheDocument()

    // Switch back to panorama
    await user.click(screen.getByText('Panorama'))

    await waitFor(() => {
      expect(screen.getByText('Environment Map File')).toBeInTheDocument()
      expect(screen.queryByText('Cube Face Mapping')).not.toBeInTheDocument()
    })
  })

  it('renders the size label field', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} mode="create" />)

    expect(screen.getByLabelText(/Size Label/)).toBeInTheDocument()
  })

  it('does not show thumbnail field by default', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} />)

    expect(
      screen.queryByText('Custom Thumbnail (optional)')
    ).not.toBeInTheDocument()
  })

  it('shows thumbnail field when showThumbnailField is true', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} showThumbnailField />)

    expect(screen.getByText('Custom Thumbnail (optional)')).toBeInTheDocument()
  })

  it('does not render when not visible', () => {
    render(<EnvironmentMapUploadDialog {...defaultProps} visible={false} />)

    expect(screen.queryByText('Upload Environment Map')).not.toBeInTheDocument()
  })
})
