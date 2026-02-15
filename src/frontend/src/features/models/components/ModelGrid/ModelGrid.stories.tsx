import type { Meta, StoryObj } from '@storybook/react'
import { ModelGrid } from './ModelGrid'

const meta: Meta<typeof ModelGrid> = {
  title: 'Components/ModelGrid',
  component: ModelGrid,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof ModelGrid>

export const Default: Story = {
  args: {},
}

export const WithPackContext: Story = {
  args: {
    packId: 1,
  },
}

export const WithProjectContext: Story = {
  args: {
    projectId: 1,
  },
}

export const WithTextureSetContext: Story = {
  args: {
    textureSetId: 1,
  },
}
