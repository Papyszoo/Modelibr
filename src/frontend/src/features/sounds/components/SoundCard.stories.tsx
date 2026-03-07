import type { Meta, StoryObj } from '@storybook/react-vite'

import { type SoundDto } from '@/types'

import { SoundCard } from './SoundCard'

const mockSound: SoundDto = {
  id: 1,
  name: 'Explosion Effect',
  fileId: 101,
  categoryId: null,
  categoryName: null,
  duration: 3500,
  peaks: null,
  fileName: 'explosion.wav',
  fileSizeBytes: 512000,
  createdAt: '2025-06-01T10:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
  waveformUrl: null,
}

const noop = () => {}

const meta: Meta<typeof SoundCard> = {
  title: 'Features/Sounds/SoundCard',
  component: SoundCard,
  tags: ['autodocs'],
  args: {
    sound: mockSound,
    isSelected: false,
    isDragging: false,
    onSelect: noop,
    onClick: noop,
    onContextMenu: noop,
    onDragStart: noop,
    onDragEnd: noop,
  },
  decorators: [
    Story => (
      <div style={{ width: 280, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SoundCard>

export const Default: Story = {}

export const Selected: Story = {
  args: {
    isSelected: true,
  },
}

export const LongName: Story = {
  args: {
    sound: {
      ...mockSound,
      name: 'Very Long Sound Name That Should Be Truncated In The Card',
    },
  },
}

export const WithCategory: Story = {
  args: {
    sound: {
      ...mockSound,
      categoryId: 1,
      categoryName: 'Sound Effects',
    },
  },
}

export const ShortDuration: Story = {
  args: {
    sound: {
      ...mockSound,
      name: 'Click',
      duration: 150,
      fileSizeBytes: 8000,
    },
  },
}
