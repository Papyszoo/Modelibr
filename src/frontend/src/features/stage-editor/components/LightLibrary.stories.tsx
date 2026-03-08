import type { Meta, StoryObj } from '@storybook/react-vite'

import { LightLibrary } from './LightLibrary'

const meta: Meta<typeof LightLibrary> = {
  title: 'StageEditor/LightLibrary',
  component: LightLibrary,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 280, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onAddLight: () => {},
  },
}

export default meta
type Story = StoryObj<typeof LightLibrary>

export const Default: Story = {}
