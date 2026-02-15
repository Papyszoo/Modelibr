import type { Meta, StoryObj } from '@storybook/react'
import { DraggableTab } from './DraggableTab'
import { Tab } from '@/types'

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
    side: {
      control: 'select',
      options: ['left', 'right'],
      description: 'Which side of the screen the tab is on',
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
    side: 'left',
    ...defaultHandlers,
  },
}

export const ModelViewer: Story = {
  args: {
    tab: {
      id: 'model-viewer-1',
      type: 'modelViewer',
      modelId: 'model-123',
      params: { modelId: 'model-123' },
      internalUiState: {},
    },
    isActive: true,
    side: 'left',
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
    side: 'left',
    ...defaultHandlers,
  },
}

export const TextureSetViewer: Story = {
  args: {
    tab: {
      id: 'texture-set-viewer-1',
      type: 'textureSetViewer',
      setId: 'set-123',
      label: 'Wood Texture Set',
      params: { setId: 'set-123' },
      internalUiState: {},
    },
    isActive: true,
    side: 'right',
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
    side: 'right',
    ...defaultHandlers,
  },
}

export const AllTabTypes: Story = {
  args: {
    tab: {
      id: '1',
      type: 'modelList',
      label: 'Models',
      params: {},
      internalUiState: {},
    },
    isActive: false,
    side: 'left',
    ...defaultHandlers,
  },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <DraggableTab
          tab={{
            id: '1',
            type: 'modelList',
            label: 'Models',
            params: {},
            internalUiState: {},
          }}
          isActive={false}
          side="left"
          {...defaultHandlers}
        />
        <DraggableTab
          tab={{
            id: '2',
            type: 'modelViewer',
            modelId: 'model-123',
            params: { modelId: 'model-123' },
            internalUiState: {},
          }}
          isActive={false}
          side="left"
          {...defaultHandlers}
        />
        <DraggableTab
          tab={{
            id: '3',
            type: 'textureSets',
            label: 'Textures',
            params: {},
            internalUiState: {},
          }}
          isActive={false}
          side="left"
          {...defaultHandlers}
        />
        <DraggableTab
          tab={{
            id: '4',
            type: 'textureSets',
            label: 'Texture Sets',
            params: {},
            internalUiState: {},
          }}
          isActive={true}
          side="left"
          {...defaultHandlers}
        />
        <DraggableTab
          tab={{
            id: '5',
            type: 'textureSetViewer',
            setId: 'set-123',
            label: 'Wood Texture',
            params: { setId: 'set-123' },
            internalUiState: {},
          }}
          isActive={false}
          side="left"
          {...defaultHandlers}
        />
        <DraggableTab
          tab={{
            id: '6',
            type: 'sprites',
            label: 'Sprites',
            params: {},
            internalUiState: {},
          }}
          isActive={false}
          side="left"
          {...defaultHandlers}
        />
        <DraggableTab
          tab={{
            id: '7',
            type: 'settings',
            label: 'Settings',
            params: {},
            internalUiState: {},
          }}
          isActive={false}
          side="left"
          {...defaultHandlers}
        />
      </div>
      <div style={{ marginTop: '16px', fontSize: '14px', color: '#888' }}>
        <p>Icon mapping:</p>
        <ul>
          <li>Model List: pi-list</li>
          <li>Model Viewer: pi-eye</li>
          <li>Texture: pi-image</li>
          <li>
            <strong>Texture Sets: pi-palette (NEW)</strong>
          </li>
          <li>
            <strong>Texture Set Viewer: pi-images (NEW)</strong>
          </li>
          <li>Sprites: pi-play</li>
          <li>Settings: pi-cog</li>
        </ul>
      </div>
    </div>
  ),
}
