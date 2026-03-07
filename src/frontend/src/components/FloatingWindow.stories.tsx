import type { Meta, StoryObj } from '@storybook/react-vite'

import { FloatingWindow } from './FloatingWindow'

const meta: Meta<typeof FloatingWindow> = {
  title: 'Layout/FloatingWindow',
  component: FloatingWindow,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div style={{ position: 'relative', width: '100%', height: 500 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    visible: true,
    onClose: () => {},
    title: 'Window Title',
    side: 'left',
    windowId: 'story-window',
    children: (
      <div style={{ padding: 16 }}>
        <p>Window content goes here.</p>
      </div>
    ),
  },
}

export default meta
type Story = StoryObj<typeof FloatingWindow>

export const Default: Story = {}

export const RightSide: Story = {
  args: {
    side: 'right',
    title: 'Right Side Window',
  },
}

export const Centered: Story = {
  args: {
    side: 'none',
    title: 'Centered Window',
  },
}

export const Hidden: Story = {
  args: {
    visible: false,
  },
}

export const LongTitle: Story = {
  args: {
    title: 'A Very Long Window Title That Might Need Truncation',
  },
}

export const RichContent: Story = {
  args: {
    title: 'Rich Content',
    children: (
      <div style={{ padding: 16 }}>
        <h3>Settings</h3>
        <p>Some descriptive text about the settings panel.</p>
        <ul>
          <li>Item one</li>
          <li>Item two</li>
          <li>Item three</li>
        </ul>
      </div>
    ),
  },
}
