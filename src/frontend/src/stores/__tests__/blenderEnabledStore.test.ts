import { act } from '@testing-library/react'

import { client } from '@/lib/apiBase'

import { useBlenderEnabledStore } from '../blenderEnabledStore'

const mockClient = client as jest.Mocked<typeof client>

describe('blenderEnabledStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset store state between tests
    useBlenderEnabledStore.setState({ blenderEnabled: false, loading: true })
  })

  it('should have blenderEnabled=false by default', () => {
    const state = useBlenderEnabledStore.getState()
    expect(state.blenderEnabled).toBe(false)
  })

  it('should set blenderEnabled=true when API returns enableBlender=true', async () => {
    mockClient.get.mockResolvedValueOnce({
      data: { enableBlender: true },
    } as any)

    await act(async () => {
      await useBlenderEnabledStore.getState().fetchBlenderEnabled()
    })

    const state = useBlenderEnabledStore.getState()
    expect(state.blenderEnabled).toBe(true)
    expect(state.loading).toBe(false)
    expect(mockClient.get).toHaveBeenCalledWith('/settings/blender-enabled')
  })

  it('should set blenderEnabled=false when API returns enableBlender=false', async () => {
    mockClient.get.mockResolvedValueOnce({
      data: { enableBlender: false },
    } as any)

    await act(async () => {
      await useBlenderEnabledStore.getState().fetchBlenderEnabled()
    })

    const state = useBlenderEnabledStore.getState()
    expect(state.blenderEnabled).toBe(false)
    expect(state.loading).toBe(false)
  })

  it('should set blenderEnabled=false on API error', async () => {
    mockClient.get.mockRejectedValueOnce(new Error('Network error'))

    await act(async () => {
      await useBlenderEnabledStore.getState().fetchBlenderEnabled()
    })

    const state = useBlenderEnabledStore.getState()
    expect(state.blenderEnabled).toBe(false)
    expect(state.loading).toBe(false)
  })
})
