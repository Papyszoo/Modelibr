import type { Meta, StoryObj } from '@storybook/react'
import TexturePreviewPanel from '../components/tabs/texture-set-viewer/TexturePreviewPanel'
import { TextureSetDto, TextureType } from '../types'

const mockTextureSet: TextureSetDto = {
  id: 1,
  name: 'Wood Material Pack',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  textureCount: 3,
  isEmpty: false,
  textures: [
    {
      id: 1,
      textureType: TextureType.Albedo,
      fileId: 1,
      fileName: 'wood_albedo.jpg',
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      textureType: TextureType.Normal,
      fileId: 2,
      fileName: 'wood_normal.jpg',
      createdAt: new Date().toISOString(),
    },
    {
      id: 3,
      textureType: TextureType.Roughness,
      fileId: 3,
      fileName: 'wood_roughness.jpg',
      createdAt: new Date().toISOString(),
    },
  ],
  associatedModels: [],
}

const meta = {
  title: 'Components/TexturePreviewPanel',
  component: TexturePreviewPanel,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TexturePreviewPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    textureSet: mockTextureSet,
  },
}
