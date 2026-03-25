import { act } from '@testing-library/react'

import { client } from '@/lib/apiBase'

import { useBlenderEnabledStore } from '../blenderEnabledStore'

const mockClient = client as jest.Mocked<typeof client>

describe('blenderEnabledStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset store state between tests
    useBlenderEnabledStore.setState({
      blenderEnabled: false,
      blenderPath: 'blender',
      settingEnabled: false,
      installed: false,
      installedVersion: null,
      loading: true,
    })
  })

  it('should have correct default values', () => {
    const state = useBlenderEnabledStore.getState()
    expect(state.blenderEnabled).toBe(false)
    expect(state.blenderPath).toBe('blender')
    expect(state.settingEnabled).toBe(false)
    expect(state.installed).toBe(false)
    expect(state.installedVersion).toBeNull()
    expect(state.loading).toBe(true)
  })

  it('should set all fields when API returns full response', async () => {
    mockClient.get.mockResolvedValueOnce({
      data: {
        enableBlender: true,
        blenderPath: '/opt/blender/blender',
        settingEnabled: true,
        installed: true,
        installedVersion: '4.2.0',
      },
    } as any)

    await act(async () => {
      await useBlenderEnabledStore.getState().fetchBlenderEnabled()
    })

    const state = useBlenderEnabledStore.getState()
    expect(state.blenderEnabled).toBe(true)
    expect(state.blenderPath).toBe('/opt/blender/blender')
    expect(state.settingEnabled).toBe(true)
    expect(state.installed).toBe(true)
    expect(state.installedVersion).toBe('4.2.0')
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

  it('should default optional fields when API omits them', async () => {
    mockClient.get.mockResolvedValueOnce({
      data: { enableBlender: true },
    } as any)

    await act(async () => {
      await useBlenderEnabledStore.getState().fetchBlenderEnabled()
    })

    const state = useBlenderEnabledStore.getState()
    expect(state.blenderEnabled).toBe(true)
    expect(state.blenderPath).toBe('blender')
    expect(state.settingEnabled).toBe(false)
    expect(state.installed).toBe(false)
    expect(state.installedVersion).toBeNull()
    expect(state.loading).toBe(false)
  })

  it('should reset all fields to defaults on API error', async () => {
    // First set some non-default values
    useBlenderEnabledStore.setState({
      blenderEnabled: true,
      blenderPath: '/opt/blender/blender',
      settingEnabled: true,
      installed: true,
      installedVersion: '4.2.0',
    })

    mockClient.get.mockRejectedValueOnce(new Error('Network error'))

    await act(async () => {
      await useBlenderEnabledStore.getState().fetchBlenderEnabled()
    })

    const state = useBlenderEnabledStore.getState()
    expect(state.blenderEnabled).toBe(false)
    expect(state.blenderPath).toBe('blender')
    expect(state.settingEnabled).toBe(false)
    expect(state.installed).toBe(false)
    expect(state.installedVersion).toBeNull()
    expect(state.loading).toBe(false)
  })
})
