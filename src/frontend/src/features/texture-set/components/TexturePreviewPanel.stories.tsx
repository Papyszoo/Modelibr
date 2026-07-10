import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { TexturePreviewPanel } from '@/features/texture-set/components/TexturePreviewPanel'
import { type TextureSetDto, TextureType } from '@/types'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

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
  // The panel reads settings via React Query — without a provider the story
  // throws "No QueryClient set" and (until the visual suite's error gate)
  // silently broke every alphabetically-later story's snapshot.
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof TexturePreviewPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    textureSet: mockTextureSet,
    textureQuality: 0,
  },
}
