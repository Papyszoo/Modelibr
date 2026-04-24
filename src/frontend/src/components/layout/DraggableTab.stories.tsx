import type { Meta, StoryObj } from '@storybook/react'

import { type Tab } from '@/types'

import { DraggableTab } from './DraggableTab'

const meta = {
  title: 'Components/DraggableTab',
  component: DraggableTab,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    isActive: {
      control: 'boolean',
      description: 'Whether the tab is currently active',
    },
    tooltipPosition: {
      control: 'select',
      options: ['left', 'right', 'top', 'bottom'],
      description: 'Tooltip placement relative to the tab',
    },
  },
} satisfies Meta<typeof DraggableTab>

export default meta
type Story = StoryObj<typeof meta>

const defaultHandlers = {
  onSelect: () => console.log('Tab selected'),
  onClose: () => console.log('Tab closed'),
  onDragStart: (tab: Tab) => console.log('Drag started', tab),
  onDragEnd: () => console.log('Drag ended'),
}

export const ModelList: Story = {
  args: {
    tab: {
      id: 'model-list-1',
      type: 'modelList',
      label: 'Models',
      params: {},
      internalUiState: {},
    },
    isActive: false,
    tooltipPosition: 'right',
    ...defaultHandlers,
  },
}

export const ModelViewerActive: Story = {
  args: {
    tab: {
      id: 'model-viewer-1',
      type: 'modelViewer',
      modelId: 'model-123',
      params: { modelId: 'model-123' },
      internalUiState: {},
    },
    isActive: true,
    tooltipPosition: 'right',
    ...defaultHandlers,
  },
}

export const TextureSets: Story = {
  args: {
    tab: {
      id: 'texture-sets-1',
      type: 'textureSets',
      label: 'Texture Sets',
      params: {},
      internalUiState: {},
    },
    isActive: false,
    tooltipPosition: 'left',
    ...defaultHandlers,
  },
}

export const Settings: Story = {
  args: {
    tab: {
      id: 'settings-1',
      type: 'settings',
      label: 'Settings',
      params: {},
      internalUiState: {},
    },
    isActive: false,
    tooltipPosition: 'top',
    ...defaultHandlers,
  },
}
