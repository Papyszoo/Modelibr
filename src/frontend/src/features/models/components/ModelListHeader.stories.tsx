import type { Meta, StoryObj } from '@storybook/react-vite'

import { ModelListHeader } from './ModelListHeader'

const noop = () => {}

const meta: Meta<typeof ModelListHeader> = {
  title: 'Models/ModelListHeader',
  component: ModelListHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    isTabContent: true,
    modelCount: 42,
    onUpload: noop,
    onRefresh: noop,
  },
}

export default meta
type Story = StoryObj<typeof ModelListHeader>

export const TabContent: Story = {}

export const TabContentNoActions: Story = {
  args: {
    onUpload: undefined,
    onRefresh: undefined,
  },
}

export const TabContentZeroModels: Story = {
  args: {
    modelCount: 0,
  },
}

export const FullPage: Story = {
  args: {
    isTabContent: false,
    onBackToUpload: noop,
    onRefresh: noop,
  },
}

export const FullPageNoRefresh: Story = {
  args: {
    isTabContent: false,
    onBackToUpload: noop,
    onRefresh: undefined,
  },
}
