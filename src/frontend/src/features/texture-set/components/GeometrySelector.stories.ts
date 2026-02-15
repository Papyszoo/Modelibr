import type { Meta, StoryObj } from '@storybook/react'
import { GeometrySelector } from '@/features/texture-set/components/GeometrySelector'

const meta = {
  title: 'Components/GeometrySelector',
  component: GeometrySelector,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GeometrySelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    onGeometrySelect: geometry => {
      console.log('Selected geometry:', geometry)
      alert(`Selected: ${geometry}`)
    },
  },
}
