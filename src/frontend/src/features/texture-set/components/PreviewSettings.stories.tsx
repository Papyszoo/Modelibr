import type { Meta, StoryObj } from '@storybook/react-vite'

import { PreviewSettings, type PreviewSettingsType } from './PreviewSettings'

const defaultSettings: PreviewSettingsType = {
  type: 'sphere',
  scale: 1.0,
  wireframe: false,
  cubeSize: 1.5,
  sphereRadius: 1.0,
  sphereSegments: 32,
  cylinderRadius: 0.5,
  cylinderHeight: 2.0,
  torusRadius: 1.0,
  torusTube: 0.4,
  uvScale: 1.0,
  textureQuality: 0,
}

const meta: Meta<typeof PreviewSettings> = {
  title: 'TextureSets/PreviewSettings',
  component: PreviewSettings,
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
    settings: defaultSettings,
    onSettingsChange: () => {},
  },
}

export default meta
type Story = StoryObj<typeof PreviewSettings>

export const Default: Story = {}

export const CubeGeometry: Story = {
  args: {
    settings: { ...defaultSettings, type: 'box' },
  },
}

export const CylinderGeometry: Story = {
  args: {
    settings: { ...defaultSettings, type: 'cylinder' },
  },
}

export const TorusGeometry: Story = {
  args: {
    settings: { ...defaultSettings, type: 'torus' },
  },
}

export const Wireframe: Story = {
  args: {
    settings: { ...defaultSettings, wireframe: true },
  },
}

export const WithTilingControls: Story = {
  args: {
    showTilingControls: true,
  },
}

export const GlobalMaterialMode: Story = {
  args: {
    isGlobalMaterial: true,
  },
}
