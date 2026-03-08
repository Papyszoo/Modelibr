import type { Meta, StoryObj } from '@storybook/react-vite'

import { TextureSetListHeader } from './TextureSetListHeader'

const noop = () => {}

const meta: Meta<typeof TextureSetListHeader> = {
  title: 'TextureSets/TextureSetListHeader',
  component: TextureSetListHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    setCount: 12,
    onCreateSet: noop,
    onFilesSelected: noop,
  },
}

export default meta
type Story = StoryObj<typeof TextureSetListHeader>

export const Default: Story = {}

export const ZeroSets: Story = {
  args: { setCount: 0 },
}

export const SingleSet: Story = {
  args: { setCount: 1 },
}

export const NoUploadHandler: Story = {
  args: {
    onFilesSelected: undefined,
  },
}
