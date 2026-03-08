import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'

import { SelectProjectDialog } from './SelectProjectDialog'

const BASE_URL = 'http://localhost:8080'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const mockProjects = {
  projects: [
    {
      id: 1,
      name: 'Main Game',
      description: 'The primary game project with all core assets',
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-01-10T10:00:00Z',
      modelCount: 50,
      textureSetCount: 20,
      spriteCount: 15,
      soundCount: 10,
      isEmpty: false,
      models: [],
      textureSets: [],
      sprites: [],
    },
    {
      id: 2,
      name: 'Prototype',
      description: 'Experimental prototype',
      createdAt: '2025-02-15T14:30:00Z',
      updatedAt: '2025-02-15T14:30:00Z',
      modelCount: 3,
      textureSetCount: 1,
      spriteCount: 0,
      soundCount: 0,
      isEmpty: false,
      models: [],
      textureSets: [],
      sprites: [],
    },
    {
      id: 3,
      name: 'DLC Content',
      createdAt: '2025-03-01T08:00:00Z',
      updatedAt: '2025-03-01T08:00:00Z',
      modelCount: 10,
      textureSetCount: 5,
      spriteCount: 8,
      soundCount: 4,
      isEmpty: false,
      models: [],
      textureSets: [],
      sprites: [],
    },
  ],
}

const meta: Meta<typeof SelectProjectDialog> = {
  title: 'Shared/SelectProjectDialog',
  component: SelectProjectDialog,
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
type Story = StoryObj<typeof SelectProjectDialog>

export const WithProjects: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/projects`, () => HttpResponse.json(mockProjects)),
      ],
    },
  },
}

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/projects`, () =>
          HttpResponse.json({ projects: [] })
        ),
      ],
    },
  },
}

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/projects`, async () => {
          await new Promise(resolve => setTimeout(resolve, 999999))
          return HttpResponse.json(mockProjects)
        }),
      ],
    },
  },
}

export const CustomHeader: Story = {
  args: {
    header: 'Select a Project to Export',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(`${BASE_URL}/projects`, () => HttpResponse.json(mockProjects)),
      ],
    },
  },
}

export const Hidden: Story = {
  args: { visible: false },
}
