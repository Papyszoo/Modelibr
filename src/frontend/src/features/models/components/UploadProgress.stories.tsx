import type { Meta, StoryObj } from '@storybook/react-vite'

import { UploadProgress } from './UploadProgress'

const meta: Meta<typeof UploadProgress> = {
  title: 'Models/UploadProgress',
  component: UploadProgress,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 400, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    visible: true,
    progress: 50,
  },
}

export default meta
type Story = StoryObj<typeof UploadProgress>

export const Default: Story = {}

export const Start: Story = {
  args: { progress: 0 },
}

export const Midway: Story = {
  args: { progress: 50 },
}

export const AlmostDone: Story = {
  args: { progress: 95 },
}

export const Complete: Story = {
  args: { progress: 100 },
}

export const Hidden: Story = {
  args: { visible: false },
}
