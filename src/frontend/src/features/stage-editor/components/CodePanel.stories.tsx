import type { Meta, StoryObj } from '@storybook/react-vite'

import { CodePanel } from './CodePanel'
import { type StageConfig } from './SceneEditor'

const mockConfig: StageConfig = {
  lights: [
    {
      id: 'light-1',
      type: 'ambient',
      color: '#404040',
      intensity: 0.5,
    },
    {
      id: 'light-2',
      type: 'directional',
      color: '#ffffff',
      intensity: 1.5,
      position: [5, 10, 5],
    },
    {
      id: 'light-3',
      type: 'point',
      color: '#ff6600',
      intensity: 2.0,
      position: [0, 5, 0],
      distance: 20,
      decay: 2,
    },
  ],
  meshes: [
    {
      id: 'mesh-1',
      type: 'box',
      position: [0, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#6366f1',
    },
    {
      id: 'mesh-2',
      type: 'sphere',
      position: [3, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#22c55e',
      wireframe: true,
    },
  ],
  groups: [
    {
      id: 'group-1',
      type: 'group',
      name: 'Scene Group',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      children: [],
    },
  ],
  helpers: [
    {
      id: 'helper-1',
      type: 'grid',
      enabled: true,
    },
    {
      id: 'helper-2',
      type: 'environment',
      enabled: true,
    },
  ],
}

const meta: Meta<typeof CodePanel> = {
  title: 'StageEditor/CodePanel',
  component: CodePanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    stageConfig: mockConfig,
  },
}

export default meta
type Story = StoryObj<typeof CodePanel>

export const Default: Story = {}

export const LightsOnly: Story = {
  args: {
    stageConfig: {
      ...mockConfig,
      meshes: [],
      groups: [],
      helpers: [],
    },
  },
}

export const EmptyScene: Story = {
  args: {
    stageConfig: {
      lights: [],
      meshes: [],
      groups: [],
      helpers: [],
    },
  },
}

export const WithSpotLight: Story = {
  args: {
    stageConfig: {
      ...mockConfig,
      lights: [
        ...mockConfig.lights,
        {
          id: 'light-spot',
          type: 'spot' as const,
          color: '#ffcc00',
          intensity: 2.0,
          position: [0, 8, 0] as [number, number, number],
          angle: 0.5,
          penumbra: 0.3,
          distance: 20,
          decay: 2,
        },
      ],
    },
  },
}
