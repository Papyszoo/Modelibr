import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'

import { UnbakedRigWarning } from '@/features/model-viewer/components/UnbakedRigWarning'
import { ApiClientError, client } from '@/lib/apiBase'

// The store drives the disabled state; tests flip it per case.
let mockBlenderEnabled = false
jest.mock('@/stores/blenderEnabledStore', () => ({
  useBlenderEnabledStore: (
    selector: (state: { blenderEnabled: boolean }) => boolean
  ) => selector({ blenderEnabled: mockBlenderEnabled }),
}))

const mockPost = client.post as jest.Mock

const rigFeatures = {
  objectConstraints: 1,
  boneConstraints: 1,
  ikConstraints: 1,
  objectDrivers: 0,
  armatureDrivers: 0,
  shapeKeyDrivers: 1,
  shapeKeyActions: 1,
  droppedModifiers: ['Morph:Array (ARRAY)'],
  hasRigFeatures: true,
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('UnbakedRigWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBlenderEnabled = false
  })

  // Regression: a source with no unbaked rig (every non-.blend model) must not
  // grow a warning box, or the viewer warns about every asset it opens.
  it('renders nothing when the source has no rig features', () => {
    renderWithQueryClient(
      <UnbakedRigWarning
        modelId={2}
        unbakedRig={{ ...rigFeatures, hasRigFeatures: false }}
      />
    )

    expect(screen.queryByTestId('unbaked-rig-warning')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /bake for web/i })
    ).not.toBeInTheDocument()
  })

  it('renders nothing when the metadata carries no unbakedRig at all', () => {
    renderWithQueryClient(<UnbakedRigWarning modelId={2} unbakedRig={null} />)

    expect(screen.queryByTestId('unbaked-rig-warning')).not.toBeInTheDocument()
  })

  it('names the non-zero rig features when hasRigFeatures is true', () => {
    renderWithQueryClient(
      <UnbakedRigWarning modelId={2} unbakedRig={rigFeatures} />
    )

    expect(screen.getByTestId('unbaked-rig-warning')).toBeInTheDocument()
    // Only the non-zero counts are listed, compactly.
    expect(
      screen.getByText(/web viewer cannot play as authored/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/IK and constraints, shape-key drivers/)
    ).toBeInTheDocument()
    expect(screen.getByText(/Array modifier/)).toBeInTheDocument()
  })

  // Regression: without Blender the bake POST can only 409, so the button must
  // be dead rather than offering an action that cannot succeed.
  it('disables the bake button while Blender is not available', () => {
    mockBlenderEnabled = false
    renderWithQueryClient(
      <UnbakedRigWarning modelId={2} unbakedRig={rigFeatures} />
    )

    expect(screen.getByRole('button', { name: /bake for web/i })).toBeDisabled()
  })

  it('posts a glb convert with bake=true and confirms the queued version', async () => {
    mockBlenderEnabled = true
    mockPost.mockResolvedValue({
      data: {
        jobId: 7,
        operation: 'convert-format',
        modelId: 2,
        versionId: 2,
        alreadyQueued: false,
      },
    })
    renderWithQueryClient(
      <UnbakedRigWarning modelId={2} unbakedRig={rigFeatures} />
    )

    const button = screen.getByRole('button', { name: /bake for web/i })
    expect(button).toBeEnabled()
    await userEvent.click(button)

    expect(mockPost).toHaveBeenCalledWith('/models/2/blender/convert-format', {
      versionId: null,
      parametersJson: JSON.stringify({ format: 'glb', bake: true }),
    })
    expect(
      await screen.findByText(
        'A baked version will appear in Versions when the job finishes.'
      )
    ).toBeInTheDocument()
  })

  it('surfaces the Blender.NotAvailable conflict as an error toast', async () => {
    mockBlenderEnabled = true
    mockPost.mockRejectedValue(
      new ApiClientError(
        'Blender is not installed or is disabled. Install a Blender version in Settings, then ask again.',
        {
          status: 409,
          details: { error: 'Blender.NotAvailable' },
          isNetworkError: false,
          isTimeout: false,
          isOffline: false,
        }
      )
    )
    renderWithQueryClient(
      <UnbakedRigWarning modelId={2} unbakedRig={rigFeatures} />
    )

    await userEvent.click(screen.getByRole('button', { name: /bake for web/i }))

    await waitFor(() => {
      expect(
        screen.getByText(
          'Blender is not installed or is disabled. Install a Blender version in Settings, then ask again.'
        )
      ).toBeInTheDocument()
    })
  })
})
