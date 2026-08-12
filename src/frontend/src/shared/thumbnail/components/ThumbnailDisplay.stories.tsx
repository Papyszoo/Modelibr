import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'

import { ThumbnailDisplay } from './ThumbnailDisplay'

const BASE_URL = 'http://localhost:8080'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

// 1x1 opaque PNG so the Ready state renders a real decodable image.
const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  ),
  char => char.charCodeAt(0)
)

// The story's modelId doubles as the state selector, mirroring the states the
// component distinguishes. Mocking happens at the network layer via MSW (the
// repo's story pattern - see HeightCard.stories.tsx); the previous version
// called `jest.spyOn` in a decorator, which throws "jest is not defined" in
// the browser and broke every later story's visual snapshot.
const mswHandlers = [
  http.get(`${BASE_URL}/models/:modelId/thumbnail`, ({ params }) => {
    const modelId = String(params.modelId)
    const status =
      modelId === 'processing'
        ? 'Processing'
        : modelId === 'failed'
          ? 'Failed'
          : modelId === 'placeholder'
            ? 'Pending'
            : 'Ready'
    return HttpResponse.json({ status })
  }),
  http.get(`${BASE_URL}/models/:modelId/thumbnail/file`, ({ params }) => {
    if (params.modelId === 'failed') {
      return new HttpResponse(null, { status: 500 })
    }
    return new HttpResponse(TINY_PNG, {
      headers: { 'Content-Type': 'image/png' },
    })
  }),
]

const meta = {
  title: 'Components/ThumbnailDisplay',
  component: ThumbnailDisplay,
  parameters: {
    layout: 'centered',
    msw: { handlers: mswHandlers },
  },
  tags: ['autodocs'],
  argTypes: {
    modelId: {
      control: 'text',
      description: 'Model ID to fetch thumbnail for',
    },
  },
  // useThumbnail is a React Query hook - the story needs a provider.
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ThumbnailDisplay>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  args: {
    modelId: '1',
  },
}

export const Processing: Story = {
  args: {
    modelId: 'processing',
  },
}

export const Failed: Story = {
  args: {
    modelId: 'failed',
  },
}

export const Placeholder: Story = {
  args: {
    modelId: 'placeholder',
  },
}
