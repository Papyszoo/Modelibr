import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { http, HttpResponse } from 'msw'

import { SelectPackDialog } from './SelectPackDialog'

const BASE_URL = 'http://localhost:8080'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const mockPacks = {
  packs: [
    {
      id: 1,
      name: 'Fantasy Pack',
      description: 'Medieval fantasy themed 3D assets',
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-01-10T10:00:00Z',
      modelCount: 12,
      textureSetCount: 5,
      spriteCount: 0,
      soundCount: 3,
      isEmpty: false,
      models: [],
      textureSets: [],
      sprites: [],
    },
    {
      id: 2,
      name: 'Sci-Fi Pack',
      description: 'Futuristic sci-fi themed assets',
      createdAt: '2025-02-15T14:30:00Z',
      updatedAt: '2025-02-15T14:30:00Z',
      modelCount: 8,
      textureSetCount: 3,
      spriteCount: 2,
      soundCount: 0,
      isEmpty: false,
      models: [],
      textureSets: [],
      sprites: [],
    },
    {
      id: 3,
      name: 'Nature Pack',
      createdAt: '2025-03-01T08:00:00Z',
      updatedAt: '2025-03-01T08:00:00Z',
      modelCount: 5,
      textureSetCount: 10,
      spriteCount: 0,
      soundCount: 0,
      isEmpty: false,
      models: [],
      textureSets: [],
      sprites: [],
    },
  ],
}

const meta: Meta<typeof SelectPackDialog> = {
  title: 'Shared/SelectPackDialog',
  component: SelectPackDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: {
    visible: true,
    onHide: () => {},
    onSelect: () => {},
  },
}

export default meta
type Story = StoryObj<typeof SelectPackDialog>

export const WithPacks: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/packs`, () => HttpResponse.json(mockPacks)),
      ],
    },
  },
}

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/packs`, () =>
          HttpResponse.json({ packs: [] })
        ),
      ],
    },
  },
}

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/packs`, async () => {
          await new Promise(resolve => setTimeout(resolve, 999999))
          return HttpResponse.json(mockPacks)
        }),
      ],
    },
  },
}

export const CustomHeader: Story = {
  args: {
    header: 'Select a Pack to Export',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/packs`, () => HttpResponse.json(mockPacks)),
      ],
    },
  },
}

export const Hidden: Story = {
  args: { visible: false },
}
