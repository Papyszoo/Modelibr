import type { Meta, StoryObj } from '@storybook/react-vite'
import ThumbnailDisplay from './ThumbnailDisplay'
import ApiClient from '../../../services/ApiClient'

// Mock ApiClient for Storybook
const mockApiClient = ApiClient as any

const meta = {
  title: 'Components/ThumbnailDisplay',
  component: ThumbnailDisplay,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    modelId: {
      control: 'text',
      description: 'Model ID to fetch thumbnail for',
    },
  },
  decorators: [
    (Story, context) => {
      // Mock different thumbnail states for different modelIds
      const modelId = context.args.modelId || '1'

      mockApiClient.getThumbnailStatus = jest.fn().mockResolvedValue({
        status:
          modelId === 'processing'
            ? 'Processing'
            : modelId === 'failed'
              ? 'Failed'
              : modelId === 'placeholder'
                ? 'Pending'
                : 'Ready',
      })

      mockApiClient.getThumbnailFile = jest.fn().mockImplementation(() => {
        if (modelId === 'failed') {
          return Promise.reject(new Error('Failed to fetch'))
        }
        // Return a placeholder image blob
        return Promise.resolve(
          new Blob(['mock image data'], { type: 'image/webp' })
        )
      })

      return <Story />
    },
  ],
} satisfies Meta<typeof ThumbnailDisplay>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  args: {
    modelId: '1',
  },
}

export const Processing: Story = {
  args: {
    modelId: 'processing',
  },
}

export const Failed: Story = {
  args: {
    modelId: 'failed',
  },
}

export const Placeholder: Story = {
  args: {
    modelId: 'placeholder',
  },
}
