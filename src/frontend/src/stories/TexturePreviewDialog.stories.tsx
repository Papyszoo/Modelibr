import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import TexturePreviewDialog from '../components/tabs/texture-pack-viewer/TexturePreviewDialog'
import { Button } from 'primereact/button'
import { TexturePackDto, TextureType } from '../types'

const mockTexturePack: TexturePackDto = {
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
  title: 'Components/TexturePreviewDialog',
  component: TexturePreviewDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TexturePreviewDialog>

export default meta
type Story = StoryObj<typeof meta>

// Wrapper component to handle the dialog state
function TexturePreviewWrapper({
  geometryType,
}: {
  geometryType: 'box' | 'sphere' | 'cylinder' | 'torus'
}) {
  const [visible, setVisible] = useState(false)

  return (
    <>
      <Button
        label={`Preview on ${geometryType}`}
        onClick={() => setVisible(true)}
      />
      <TexturePreviewDialog
        visible={visible}
        geometryType={geometryType}
        texturePack={mockTexturePack}
        onHide={() => setVisible(false)}
      />
    </>
  )
}

export const CubePreview: Story = {
  render: () => <TexturePreviewWrapper geometryType="box" />,
}

export const SpherePreview: Story = {
  render: () => <TexturePreviewWrapper geometryType="sphere" />,
}

export const CylinderPreview: Story = {
  render: () => <TexturePreviewWrapper geometryType="cylinder" />,
}

export const TorusPreview: Story = {
  render: () => <TexturePreviewWrapper geometryType="torus" />,
}
