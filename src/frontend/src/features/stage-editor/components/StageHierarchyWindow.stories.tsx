import type { Meta, StoryObj } from '@storybook/react'
import StageHierarchyWindow from './StageHierarchyWindow'
import { StageConfig } from './SceneEditor'

const meta: Meta<typeof StageHierarchyWindow> = {
  title: 'Stage Editor/StageHierarchyWindow',
  component: StageHierarchyWindow,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof StageHierarchyWindow>

const sampleConfig: StageConfig = {
  lights: [
    {
      id: 'light-1',
      type: 'directional',
      color: '#ffffff',
      intensity: 1.0,
      position: [5, 5, 5],
    },
  ],
  meshes: [
    {
      id: 'mesh-1',
      type: 'box',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#4a9eff',
    },
    {
      id: 'mesh-2',
      type: 'sphere',
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#ff6b35',
    },
  ],
  groups: [
    {
      id: 'group-1',
      type: 'group',
      name: 'My Group',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      children: ['mesh-1'],
    },
  ],
  helpers: [],
}

export const Default: Story = {
  args: {
    visible: true,
    onClose: () => {},
    side: 'left',
    stageConfig: sampleConfig,
    selectedObjectId: null,
    onSelectObject: () => {},
    onDeleteObject: () => {},
    onUpdateGroup: () => {},
  },
}

export const WithSelection: Story = {
  args: {
    visible: true,
    onClose: () => {},
    side: 'left',
    stageConfig: sampleConfig,
    selectedObjectId: 'mesh-1',
    onSelectObject: () => {},
    onDeleteObject: () => {},
    onUpdateGroup: () => {},
  },
}

export const RightSide: Story = {
  args: {
    visible: true,
    onClose: () => {},
    side: 'right',
    stageConfig: sampleConfig,
    selectedObjectId: null,
    onSelectObject: () => {},
    onDeleteObject: () => {},
    onUpdateGroup: () => {},
  },
}
