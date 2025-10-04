import type { Meta, StoryObj } from '@storybook/react-vite'
import ModelInfo from './ModelInfo'
import { Model } from '../utils/fileUtils'

const meta = {
  title: 'Components/ModelInfo',
  component: ModelInfo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    model: { control: 'object' },
  },
} satisfies Meta<typeof ModelInfo>

export default meta
type Story = StoryObj<typeof meta>

const mockModel: Model = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Sample 3D Model',
  createdAt: '2025-01-15T10:30:00Z',
  updatedAt: '2025-01-15T12:45:00Z',
  files: [
    {
      id: 'file-1',
      originalFileName: 'model.obj',
      hash: 'abc123def456',
      size: 1024000,
      isRenderable: true,
    },
  ],
}

export const Default: Story = {
  args: {
    model: mockModel,
  },
}

export const GLTFModel: Story = {
  args: {
    model: {
      ...mockModel,
      name: 'Character Model',
      files: [
        {
          id: 'file-2',
          originalFileName: 'character.gltf',
          hash: 'gltf123hash',
          size: 2048000,
          isRenderable: true,
        },
      ],
    },
  },
}

export const FBXModel: Story = {
  args: {
    model: {
      ...mockModel,
      name: 'Building Model',
      files: [
        {
          id: 'file-3',
          originalFileName: 'building.fbx',
          hash: 'fbx456hash',
          size: 5120000,
          isRenderable: true,
        },
      ],
    },
  },
}
