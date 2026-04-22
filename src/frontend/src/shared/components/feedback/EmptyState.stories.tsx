import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from 'primereact/button'

import { EmptyState } from './EmptyState'

const meta: Meta<typeof EmptyState> = {
  title: 'Shared/Feedback/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['default', 'compact'],
    },
    icon: { control: 'text' },
    title: { control: 'text' },
    message: { control: 'text' },
    dragOver: { control: 'boolean' },
  },
  args: {
    icon: 'pi-box',
    title: 'No models yet',
    message: 'Drag and drop 3D model files here to get started.',
    variant: 'default',
    dragOver: false,
  },
}

export default meta
type Story = StoryObj<typeof EmptyState>

export const Default: Story = {}

export const Compact: Story = {
  args: { variant: 'compact' },
}

export const WithAction: Story = {
  args: {
    action: <Button label="Upload" icon="pi pi-upload" />,
  },
}

export const DragOver: Story = {
  args: { dragOver: true },
}

export const TitleOnly: Story = {
  args: { message: undefined },
}
