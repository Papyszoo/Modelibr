import type { Meta, StoryObj } from '@storybook/react-vite'

import { StageListHeader } from './StageListHeader'

const meta: Meta<typeof StageListHeader> = {
  title: 'StageEditor/StageListHeader',
  component: StageListHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onCreateClick: () => {},
  },
}

export default meta
type Story = StoryObj<typeof StageListHeader>

export const Default: Story = {}
