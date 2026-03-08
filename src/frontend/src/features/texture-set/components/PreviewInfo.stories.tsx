import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  type TextureSetDto,
  TextureSetKind,
  TextureType,
  UvMappingMode,
} from '@/types'

import { PreviewInfo } from './PreviewInfo'

const mockTextureSet: TextureSetDto = {
  id: 1,
  name: 'Brick Wall PBR',
  kind: TextureSetKind.Universal,
  tilingScaleX: 1,
  tilingScaleY: 1,
  uvMappingMode: UvMappingMode.Standard,
  uvScale: 1,
  createdAt: '2025-06-01T10:00:00Z',
  updatedAt: '2025-06-01T10:00:00Z',
  textureCount: 4,
  isEmpty: false,
  textures: [
    {
      id: 1,
      textureType: TextureType.Albedo,
      sourceChannel: 5,
      fileId: 101,
      fileName: 'albedo.png',
      createdAt: '2025-06-01T10:00:00Z',
    },
    {
      id: 2,
      textureType: TextureType.Normal,
      sourceChannel: 5,
      fileId: 102,
      fileName: 'normal.png',
      createdAt: '2025-06-01T10:00:00Z',
    },
    {
      id: 3,
      textureType: TextureType.AO,
      sourceChannel: 5,
      fileId: 103,
      fileName: 'ao.png',
      createdAt: '2025-06-01T10:00:00Z',
    },
    {
      id: 4,
      textureType: TextureType.Roughness,
      sourceChannel: 5,
      fileId: 104,
      fileName: 'roughness.png',
      createdAt: '2025-06-01T10:00:00Z',
    },
  ],
  associatedModels: [],
}

const noop = () => {}

const meta: Meta<typeof PreviewInfo> = {
  title: 'TextureSets/PreviewInfo',
  component: PreviewInfo,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 300, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    textureSet: mockTextureSet,
    geometryType: 'sphere',
    disabledTextures: new Set<string>(),
    textureStrengths: { Normal: 1, AO: 0.8 },
    onToggleTexture: noop,
    onStrengthChange: noop,
  },
}

export default meta
type Story = StoryObj<typeof PreviewInfo>

export const Default: Story = {}

export const WithDisabledTextures: Story = {
  args: {
    disabledTextures: new Set(['Normal', 'AO']),
  },
}

export const CubeGeometry: Story = {
  args: {
    geometryType: 'box',
  },
}

export const EmptyTextureSet: Story = {
  args: {
    textureSet: {
      ...mockTextureSet,
      textures: [],
      textureCount: 0,
      isEmpty: true,
    },
  },
}

export const WithHeightTextures: Story = {
  args: {
    textureSet: {
      ...mockTextureSet,
      textures: [
        ...mockTextureSet.textures,
        {
          id: 5,
          textureType: TextureType.Height,
          sourceChannel: 5,
          fileId: 105,
          fileName: 'height.png',
          createdAt: '2025-06-01T10:00:00Z',
        },
        {
          id: 6,
          textureType: TextureType.Emissive,
          sourceChannel: 5,
          fileId: 106,
          fileName: 'emissive.png',
          createdAt: '2025-06-01T10:00:00Z',
        },
      ],
    },
    textureStrengths: { Normal: 1, AO: 0.8, Height: 0.5, Emissive: 0.6 },
  },
}
