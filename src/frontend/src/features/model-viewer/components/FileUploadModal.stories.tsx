import type { Meta, StoryObj } from '@storybook/react-vite'

import { type ModelVersionDto } from '@/types'

import { FileUploadModal } from './FileUploadModal'

const mockVersions: ModelVersionDto[] = [
  {
    id: 1,
    modelId: 1,
    versionNumber: 1,
    description: 'Initial version',
    createdAt: '2025-01-10T10:00:00Z',
    files: [
      {
        id: 10,
        originalFileName: 'model_v1.glb',
        mimeType: 'model/gltf-binary',
        fileType: 'glb',
        sizeBytes: 2048000,
        isRenderable: true,
      },
    ],
  },
  {
    id: 2,
    modelId: 1,
    versionNumber: 2,
    description: 'Added textures',
    createdAt: '2025-02-15T14:30:00Z',
    files: [
      {
        id: 20,
        originalFileName: 'model_v2.glb',
        mimeType: 'model/gltf-binary',
        fileType: 'glb',
        sizeBytes: 4096000,
        isRenderable: true,
      },
    ],
  },
]

const mockFile = new File(['mock'], 'character.glb', {
  type: 'model/gltf-binary',
})
Object.defineProperty(mockFile, 'size', { value: 1536000 })

const meta: Meta<typeof FileUploadModal> = {
  title: 'Models/FileUploadModal',
  component: FileUploadModal,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    visible: true,
    onHide: () => {},
    file: mockFile,
    modelId: 1,
    versions: mockVersions,
    selectedVersion: mockVersions[1],
    onUpload: async () => {},
  },
}

export default meta
type Story = StoryObj<typeof FileUploadModal>

export const Default: Story = {}

export const NoSelectedVersion: Story = {
  args: {
    selectedVersion: null,
  },
}

export const SingleVersion: Story = {
  args: {
    versions: [mockVersions[0]],
    selectedVersion: mockVersions[0],
  },
}

export const NoFile: Story = {
  args: {
    file: null,
  },
}

export const NoVersions: Story = {
  args: {
    versions: [],
    selectedVersion: null,
  },
}
