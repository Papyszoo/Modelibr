import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  TextureChannel,
  type TextureDto,
  TextureType,
} from '@/features/texture-set/types'

import { TextureCard } from './TextureCard'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const mockTexture: TextureDto = {
  id: 1,
  textureType: TextureType.Albedo,
  sourceChannel: TextureChannel.RGB,
  fileId: 42,
  fileName: 'albedo_2k.png',
  createdAt: '2025-06-01T10:00:00Z',
}

const meta: Meta<typeof TextureCard> = {
  title: 'Features/TextureSet/TextureCard',
  component: TextureCard,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div style={{ width: 220, padding: 16 }}>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    setId: 1,
    onTextureUpdated: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TextureCard>

export const WithTexture: Story = {
  args: {
    textureType: TextureType.Albedo,
    texture: mockTexture,
  },
}

export const EmptySlot: Story = {
  args: {
    textureType: TextureType.Normal,
    texture: null,
  },
}

export const RoughnessTexture: Story = {
  args: {
    textureType: TextureType.Roughness,
    texture: {
      ...mockTexture,
      id: 2,
      textureType: TextureType.Roughness,
      fileName: 'roughness_2k.png',
    },
  },
}

export const MetallicTexture: Story = {
  args: {
    textureType: TextureType.Metallic,
    texture: {
      ...mockTexture,
      id: 3,
      textureType: TextureType.Metallic,
      fileName: 'metallic_2k.png',
    },
  },
}

export const EmissiveEmpty: Story = {
  args: {
    textureType: TextureType.Emissive,
    texture: null,
  },
}
