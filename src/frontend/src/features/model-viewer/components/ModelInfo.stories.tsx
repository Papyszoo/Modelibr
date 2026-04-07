import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Model } from '@/utils/fileUtils'

import { ModelInfo } from './ModelInfo'

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
  description: 'A sample storybook model.',
  tags: ['storybook', 'sample'],
  createdAt: '2025-01-15T10:30:00Z',
  updatedAt: '2025-01-15T12:45:00Z',
  files: [
    {
      id: 'file-1',
      originalFileName: 'model.obj',
      storedFileName: 'model.obj',
      filePath: 'model.obj',
      mimeType: 'model/obj',
      sizeBytes: 1024000,
      sha256Hash: 'abc123def456',
      fileType: 'obj',
      isRenderable: true,
      createdAt: '2025-01-15T10:30:00Z',
      updatedAt: '2025-01-15T12:45:00Z',
    },
  ],
  textureSets: [],
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
          storedFileName: 'character.gltf',
          filePath: 'character.gltf',
          mimeType: 'model/gltf+json',
          sizeBytes: 2048000,
          sha256Hash: 'gltf123hash',
          fileType: 'gltf',
          isRenderable: true,
          createdAt: '2025-01-15T10:30:00Z',
          updatedAt: '2025-01-15T12:45:00Z',
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
          storedFileName: 'building.fbx',
          filePath: 'building.fbx',
          mimeType: 'application/octet-stream',
          sizeBytes: 5120000,
          sha256Hash: 'fbx456hash',
          fileType: 'fbx',
          isRenderable: true,
          createdAt: '2025-01-15T10:30:00Z',
          updatedAt: '2025-01-15T12:45:00Z',
        },
      ],
    },
  },
}
