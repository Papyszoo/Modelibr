import type { Meta, StoryObj } from '@storybook/react-vite'

// Simple mock component for demonstration purposes
// In a real scenario, you would mock the useThumbnailManager hook properly
const ThumbnailDisplayDemo = ({
  size = 'medium',
  state = 'ready',
  showControls = false,
}) => {
  const getSizeClass = () => {
    switch (size) {
      case 'small':
        return 'thumbnail-small'
      case 'large':
        return 'thumbnail-large'
      default:
        return 'thumbnail-medium'
    }
  }

  const renderContent = () => {
    if (state === 'processing') {
      return (
        <div className="thumbnail-loading" aria-label="Loading thumbnail">
          <div className="thumbnail-spinner" />
          <span className="thumbnail-status-text">Generating thumbnail...</span>
        </div>
      )
    }

    if (state === 'failed') {
      return (
        <div className="thumbnail-error" aria-label="Thumbnail failed to generate">
          <i className="pi pi-exclamation-triangle" aria-hidden="true" />
          <span className="thumbnail-status-text">Thumbnail generation failed</span>
          {showControls && (
            <button className="thumbnail-retry-btn" aria-label="Regenerate thumbnail">
              <i className="pi pi-refresh" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      )
    }

    if (state === 'ready') {
      return (
        <div className="thumbnail-image-container">
          <img
            src="https://via.placeholder.com/300x300/333333/666666?text=3D+Model"
            alt="3D Model Thumbnail"
            className="thumbnail-image"
            loading="lazy"
          />
          {showControls && (
            <div className="thumbnail-overlay">
              <button className="thumbnail-retry-btn" aria-label="Regenerate thumbnail">
                <i className="pi pi-refresh" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="thumbnail-placeholder" aria-label="No thumbnail available">
        <i className="pi pi-image" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className={`thumbnail-display ${getSizeClass()}`}>
      {renderContent()}
    </div>
  )
}

const meta = {
  title: 'Components/ThumbnailDisplay',
  component: ThumbnailDisplayDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
    state: {
      control: 'select',
      options: ['ready', 'processing', 'failed', 'placeholder'],
    },
    showControls: { control: 'boolean' },
  },
} satisfies Meta<typeof ThumbnailDisplayDemo>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  args: {
    size: 'medium',
    state: 'ready',
    showControls: false,
  },
}

export const Processing: Story = {
  args: {
    size: 'medium',
    state: 'processing',
    showControls: false,
  },
}

export const Failed: Story = {
  args: {
    size: 'medium',
    state: 'failed',
    showControls: true,
  },
}

export const Placeholder: Story = {
  args: {
    size: 'medium',
    state: 'placeholder',
    showControls: false,
  },
}

export const SmallSize: Story = {
  args: {
    size: 'small',
    state: 'ready',
    showControls: false,
  },
}

export const LargeSize: Story = {
  args: {
    size: 'large',
    state: 'ready',
    showControls: false,
  },
}

export const WithControls: Story = {
  args: {
    size: 'medium',
    state: 'ready',
    showControls: true,
  },
}

