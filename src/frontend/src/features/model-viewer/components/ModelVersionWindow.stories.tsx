import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { http, HttpResponse } from 'msw'

import { ModelVersionWindow } from './ModelVersionWindow'

const BASE_URL = 'http://localhost:8080'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const mockVersions = [
  {
    id: 1,
    modelId: 1,
    versionNumber: 1,
    description: 'Initial version',
    isActive: false,
    createdAt: '2025-01-10T10:00:00Z',
    files: [
      {
        id: 10,
        originalFileName: 'model_v1.glb',
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
    description: 'Added textures and improved mesh',
    isActive: true,
    createdAt: '2025-02-15T14:30:00Z',
    files: [
      {
        id: 20,
        originalFileName: 'model_v2.glb',
        fileType: 'glb',
        sizeBytes: 4096000,
        isRenderable: true,
      },
      {
        id: 21,
        originalFileName: 'model_v2.blend',
        fileType: 'blend',
        sizeBytes: 8192000,
        isRenderable: false,
      },
    ],
  },
]

const mockModel = {
  id: '1',
  name: 'Character Model',
  description: 'A character model',
  tags: [],
  createdAt: '2025-01-10T10:00:00Z',
  updatedAt: '2025-02-15T14:30:00Z',
  isRecycled: false,
  versions: [],
}

const meta: Meta<typeof ModelVersionWindow> = {
  title: 'Features/ModelViewer/ModelVersionWindow',
  component: ModelVersionWindow,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div style={{ position: 'relative', width: '100%', height: 500 }}>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    visible: true,
    onClose: () => {},
    side: 'left',
    modelId: '1',
  },
}

export default meta
type Story = StoryObj<typeof ModelVersionWindow>

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/models/1`, () => HttpResponse.json(mockModel)),
        http.get(`${BASE_URL}/models/1/versions`, () =>
          HttpResponse.json(mockVersions)
        ),
      ],
    },
  },
}

export const NoModel: Story = {
  args: {
    modelId: null,
  },
}

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/models/1`, async () => {
          await new Promise(resolve => setTimeout(resolve, 999999))
          return HttpResponse.json(mockModel)
        }),
        http.get(`${BASE_URL}/models/1/versions`, async () => {
          await new Promise(resolve => setTimeout(resolve, 999999))
          return HttpResponse.json(mockVersions)
        }),
      ],
    },
  },
}

export const RightSide: Story = {
  args: {
    side: 'right',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/models/1`, () => HttpResponse.json(mockModel)),
        http.get(`${BASE_URL}/models/1/versions`, () =>
          HttpResponse.json(mockVersions)
        ),
      ],
    },
  },
}
