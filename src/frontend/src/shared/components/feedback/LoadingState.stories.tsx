import type { Meta, StoryObj } from '@storybook/react-vite'

import { LoadingState } from './LoadingState'

const meta: Meta<typeof LoadingState> = {
  title: 'Shared/Feedback/LoadingState',
  component: LoadingState,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['block', 'inline'],
    },
    message: { control: 'text' },
  },
  args: {
    message: 'Loading models…',
    variant: 'block',
  },
}

export default meta
type Story = StoryObj<typeof LoadingState>

export const Block: Story = {}

export const Inline: Story = {
  args: { variant: 'inline' },
}

export const NoMessage: Story = {
  args: { message: undefined },
}
