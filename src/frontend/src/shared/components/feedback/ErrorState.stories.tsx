import type { Meta, StoryObj } from '@storybook/react-vite'

import { ErrorState } from './ErrorState'

const meta: Meta<typeof ErrorState> = {
  title: 'Shared/Feedback/ErrorState',
  component: ErrorState,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['block', 'inline'],
    },
    title: { control: 'text' },
    message: { control: 'text' },
    retryLabel: { control: 'text' },
  },
  args: {
    title: 'Failed to load',
    message: 'Could not reach the server. Check your connection and try again.',
    variant: 'block',
    onRetry: () => {},
  },
}

export default meta
type Story = StoryObj<typeof ErrorState>

export const Block: Story = {}

export const Inline: Story = {
  args: { variant: 'inline' },
}

export const NoRetry: Story = {
  args: { onRetry: undefined },
}

export const MessageOnly: Story = {
  args: {
    title: undefined,
    onRetry: undefined,
  },
}
