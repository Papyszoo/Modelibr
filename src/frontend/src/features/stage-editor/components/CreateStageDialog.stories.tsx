import type { Meta, StoryObj } from '@storybook/react-vite'

import { CreateStageDialog } from './CreateStageDialog'

const meta: Meta<typeof CreateStageDialog> = {
  title: 'StageEditor/CreateStageDialog',
  component: CreateStageDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    visible: true,
    onHide: () => {},
    onCreate: () => {},
  },
}

export default meta
type Story = StoryObj<typeof CreateStageDialog>

export const Default: Story = {}

export const Hidden: Story = {
  args: { visible: false },
}
