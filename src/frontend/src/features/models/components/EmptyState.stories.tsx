import type { Meta, StoryObj } from '@storybook/react-vite'
import { EmptyState } from './EmptyState'

const meta = {
  title: 'Components/Model List/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    visible: { control: 'boolean' },
  },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    visible: true,
    onDrop: e => {
      e.preventDefault()
      console.log('Drop event:', e)
    },
    onDragOver: e => {
      e.preventDefault()
    },
    onDragEnter: e => {
      e.preventDefault()
      console.log('Drag enter')
    },
    onDragLeave: e => {
      e.preventDefault()
      console.log('Drag leave')
    },
  },
}

export const Hidden: Story = {
  args: {
    visible: false,
    onDrop: () => {},
    onDragOver: () => {},
    onDragEnter: () => {},
    onDragLeave: () => {},
  },
}
