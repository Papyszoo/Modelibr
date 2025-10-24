import type { Meta, StoryObj } from '@storybook/react'
import StageHierarchy from './StageHierarchy'
import { StageConfig } from './SceneEditor'

const meta: Meta<typeof StageHierarchy> = {
  title: 'Stage Editor/StageHierarchy',
  component: StageHierarchy,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof StageHierarchy>

const emptyConfig: StageConfig = {
  lights: [],
  meshes: [],
  groups: [],
  helpers: [],
}

const simpleConfig: StageConfig = {
  lights: [
    {
      id: 'light-1',
      type: 'directional',
      color: '#ffffff',
      intensity: 1.0,
      position: [5, 5, 5],
    },
    {
      id: 'light-2',
      type: 'ambient',
      color: '#ffffff',
      intensity: 0.5,
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
  groups: [],
  helpers: [],
}

const configWithGroups: StageConfig = {
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
    {
      id: 'mesh-3',
      type: 'cylinder',
      position: [0, 0, 2],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#00ff00',
    },
  ],
  groups: [
    {
      id: 'group-1',
      type: 'group',
      name: 'Geometry Group',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      children: ['mesh-1', 'mesh-2'],
    },
  ],
  helpers: [
    {
      id: 'helper-1',
      type: 'grid',
      enabled: true,
    },
  ],
}

export const Empty: Story = {
  args: {
    stageConfig: emptyConfig,
    selectedObjectId: null,
    onSelectObject: () => {},
    onDeleteObject: () => {},
    onUpdateGroup: () => {},
  },
}

export const WithObjects: Story = {
  args: {
    stageConfig: simpleConfig,
    selectedObjectId: null,
    onSelectObject: () => {},
    onDeleteObject: () => {},
    onUpdateGroup: () => {},
  },
}

export const WithSelection: Story = {
  args: {
    stageConfig: simpleConfig,
    selectedObjectId: 'mesh-1',
    onSelectObject: () => {},
    onDeleteObject: () => {},
    onUpdateGroup: () => {},
  },
}

export const WithGroups: Story = {
  args: {
    stageConfig: configWithGroups,
    selectedObjectId: null,
    onSelectObject: () => {},
    onDeleteObject: () => {},
    onUpdateGroup: () => {},
  },
}

export const WithGroupsAndSelection: Story = {
  args: {
    stageConfig: configWithGroups,
    selectedObjectId: 'group-1',
    onSelectObject: () => {},
    onDeleteObject: () => {},
    onUpdateGroup: () => {},
  },
}
