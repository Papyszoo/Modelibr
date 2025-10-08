import type { Meta, StoryObj } from '@storybook/react-vite'
import ErrorState from './ErrorState'

const meta = {
  title: 'Components/Model List/ErrorState',
  component: ErrorState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    visible: { control: 'boolean' },
    error: { control: 'text' },
  },
} satisfies Meta<typeof ErrorState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    visible: true,
    error: 'Failed to fetch models: Network Error',
    onRetry: () => console.log('Retry clicked'),
  },
}

export const DatabaseError: Story = {
  args: {
    visible: true,
    error: 'Database connection failed. Please try again later.',
    onRetry: () => console.log('Retry clicked'),
  },
}

export const GenericError: Story = {
  args: {
    visible: true,
    error: 'An unexpected error occurred',
    onRetry: () => console.log('Retry clicked'),
  },
}

export const Hidden: Story = {
  args: {
    visible: false,
    error: 'This error is hidden',
    onRetry: () => {},
  },
}
