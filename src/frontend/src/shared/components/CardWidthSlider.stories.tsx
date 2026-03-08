import type { Meta, StoryObj } from '@storybook/react-vite'

import { CardWidthSlider } from './CardWidthSlider'

const meta: Meta<typeof CardWidthSlider> = {
  title: 'Shared/CardWidthSlider',
  component: CardWidthSlider,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 250, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    value: 200,
    min: 120,
    max: 400,
    onChange: () => {},
  },
}

export default meta
type Story = StoryObj<typeof CardWidthSlider>

export const Default: Story = {}

export const MinValue: Story = {
  args: { value: 120 },
}

export const MaxValue: Story = {
  args: { value: 400 },
}

export const NarrowRange: Story = {
  args: {
    value: 160,
    min: 100,
    max: 200,
  },
}
