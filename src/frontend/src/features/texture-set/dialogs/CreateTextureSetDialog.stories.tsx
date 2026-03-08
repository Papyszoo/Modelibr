import type { Meta, StoryObj } from '@storybook/react-vite'

import { CreateTextureSetDialog } from './CreateTextureSetDialog'

const meta: Meta<typeof CreateTextureSetDialog> = {
  title: 'TextureSets/CreateTextureSetDialog',
  component: CreateTextureSetDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    visible: true,
    onHide: () => {},
    onSubmit: async () => {},
  },
}

export default meta
type Story = StoryObj<typeof CreateTextureSetDialog>

export const Default: Story = {}

export const Hidden: Story = {
  args: { visible: false },
}
