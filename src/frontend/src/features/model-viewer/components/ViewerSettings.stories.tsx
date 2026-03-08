import type { Meta, StoryObj } from '@storybook/react-vite'

import { ViewerSettings, type ViewerSettingsType } from './ViewerSettings'

const defaultSettings: ViewerSettingsType = {
  orbitSpeed: 1.0,
  zoomSpeed: 1.0,
  panSpeed: 1.0,
  modelRotationSpeed: 0,
  showShadows: true,
  showStats: false,
}

const meta: Meta<typeof ViewerSettings> = {
  title: 'Models/ViewerSettings',
  component: ViewerSettings,
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
type Story = StoryObj<typeof ViewerSettings>

export const Default: Story = {}

export const HighSpeeds: Story = {
  args: {
    settings: {
      ...defaultSettings,
      orbitSpeed: 2.0,
      zoomSpeed: 2.0,
      panSpeed: 2.0,
    },
  },
}

export const WithRotation: Story = {
  args: {
    settings: {
      ...defaultSettings,
      modelRotationSpeed: 0.01,
    },
  },
}

export const AllFeaturesOn: Story = {
  args: {
    settings: {
      ...defaultSettings,
      showShadows: true,
      showStats: true,
      modelRotationSpeed: 0.005,
    },
  },
}

export const AllFeaturesOff: Story = {
  args: {
    settings: {
      ...defaultSettings,
      showShadows: false,
      showStats: false,
      modelRotationSpeed: 0,
    },
  },
}
