import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { http, HttpResponse } from 'msw'

import { type TextureDto, TextureType } from '@/types'

import { HeightCard } from './HeightCard'

const BASE_URL = 'http://localhost:8080'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const heightTexture: TextureDto = {
  id: 10,
  textureType: TextureType.Height,
  sourceChannel: 5,
  fileId: 200,
  fileName: 'height.png',
  createdAt: '2025-06-01T10:00:00Z',
}

const allTextures: TextureDto[] = [
  {
    id: 1,
    textureType: TextureType.Albedo,
    sourceChannel: 5,
    fileId: 100,
    fileName: 'albedo.png',
    createdAt: '2025-06-01T10:00:00Z',
  },
  heightTexture,
]

const noop = () => {}

const mswHandlers = [
  http.get(`${BASE_URL}/files/:fileId/preview`, () =>
    HttpResponse.text('', { status: 200 })
  ),
  http.post(`${BASE_URL}/texture-sets/:setId/textures`, () =>
    HttpResponse.json({ id: 99 })
  ),
  http.put(`${BASE_URL}/texture-sets/:setId/textures/:textureId/type`, () =>
    HttpResponse.json({})
  ),
  http.delete(`${BASE_URL}/texture-sets/:setId/textures/:textureId`, () =>
    HttpResponse.json({})
  ),
  http.post(`${BASE_URL}/files/upload`, () =>
    HttpResponse.json({ fileId: 300, hash: 'abc123' })
  ),
]

const meta: Meta<typeof HeightCard> = {
  title: 'TextureSets/HeightCard',
  component: HeightCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    msw: { handlers: mswHandlers },
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div style={{ width: 280, padding: 16 }}>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    textures: allTextures,
    setId: 1,
    onTextureUpdated: noop,
  },
}

export default meta
type Story = StoryObj<typeof HeightCard>

export const WithHeightTexture: Story = {}

export const NoHeightTexture: Story = {
  args: {
    textures: [
      {
        id: 1,
        textureType: TextureType.Albedo,
        sourceChannel: 5,
        fileId: 100,
        fileName: 'albedo.png',
        createdAt: '2025-06-01T10:00:00Z',
      },
    ],
  },
}

export const WithDisplacement: Story = {
  args: {
    textures: [
      {
        id: 1,
        textureType: TextureType.Albedo,
        sourceChannel: 5,
        fileId: 100,
        fileName: 'albedo.png',
        createdAt: '2025-06-01T10:00:00Z',
      },
      {
        id: 10,
        textureType: TextureType.Displacement,
        sourceChannel: 5,
        fileId: 200,
        fileName: 'displacement.png',
        createdAt: '2025-06-01T10:00:00Z',
      },
    ],
  },
}

export const WithBump: Story = {
  args: {
    textures: [
      {
        id: 1,
        textureType: TextureType.Albedo,
        sourceChannel: 5,
        fileId: 100,
        fileName: 'albedo.png',
        createdAt: '2025-06-01T10:00:00Z',
      },
      {
        id: 10,
        textureType: TextureType.Bump,
        sourceChannel: 5,
        fileId: 200,
        fileName: 'bump.png',
        createdAt: '2025-06-01T10:00:00Z',
      },
    ],
  },
}
