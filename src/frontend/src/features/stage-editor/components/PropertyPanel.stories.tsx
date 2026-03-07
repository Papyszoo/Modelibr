import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  type StageGroup,
  type StageHelper,
  type StageLight,
  type StageMesh,
} from './SceneEditor'
import { PropertyPanel } from './PropertyPanel'

const noop = () => {}

const mockDirectionalLight: StageLight = {
  id: 'light-1',
  type: 'directional',
  color: '#ffffff',
  intensity: 1.5,
  position: [5, 10, 5],
}

const mockSpotLight: StageLight = {
  id: 'light-2',
  type: 'spot',
  color: '#ffcc00',
  intensity: 2.0,
  position: [0, 8, 0],
  angle: Math.PI / 6,
  penumbra: 0.3,
  distance: 20,
  decay: 2,
}

const mockAmbientLight: StageLight = {
  id: 'light-3',
  type: 'ambient',
  color: '#404040',
  intensity: 0.5,
}

const mockHemisphereLight: StageLight = {
  id: 'light-4',
  type: 'hemisphere',
  color: '#87CEEB',
  intensity: 0.8,
  groundColor: '#8B4513',
}

const mockMesh: StageMesh = {
  id: 'mesh-1',
  type: 'box',
  position: [0, 0.5, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: '#6366f1',
  wireframe: false,
}

const mockGroup: StageGroup = {
  id: 'group-1',
  type: 'group',
  name: 'Building Group',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  children: [],
}

const mockHelper: StageHelper = {
  id: 'helper-1',
  type: 'grid',
  enabled: true,
}

const meta: Meta<typeof PropertyPanel> = {
  title: 'StageEditor/PropertyPanel',
  component: PropertyPanel,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 320, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    selectedObject: mockDirectionalLight,
    onUpdateObject: noop,
    onDeleteObject: noop,
  },
}

export default meta
type Story = StoryObj<typeof PropertyPanel>

export const DirectionalLight: Story = {}

export const SpotLight: Story = {
  args: { selectedObject: mockSpotLight },
}

export const AmbientLight: Story = {
  args: { selectedObject: mockAmbientLight },
}

export const HemisphereLight: Story = {
  args: { selectedObject: mockHemisphereLight },
}

export const MeshObject: Story = {
  args: { selectedObject: mockMesh },
}

export const GroupObject: Story = {
  args: { selectedObject: mockGroup },
}

export const HelperObject: Story = {
  args: { selectedObject: mockHelper },
}

export const NoSelection: Story = {
  args: { selectedObject: null },
}
