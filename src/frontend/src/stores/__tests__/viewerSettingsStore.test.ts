import { act, renderHook } from '@testing-library/react'

import { useViewerSettingsStore } from '@/stores/viewerSettingsStore'

const DEFAULT_SETTINGS = {
  orbitSpeed: 1,
  zoomSpeed: 1,
  panSpeed: 1,
  modelRotationSpeed: 0.002,
  showShadows: true,
  showStats: false,
}

describe('viewerSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useViewerSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
    })
  })

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useViewerSettingsStore())

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('should update a single setting with setSetting', () => {
    const { result } = renderHook(() => useViewerSettingsStore())

    act(() => {
      result.current.setSetting('showStats', true)
    })

    expect(result.current.settings.showStats).toBe(true)
    // Other settings unchanged
    expect(result.current.settings.showShadows).toBe(true)
    expect(result.current.settings.orbitSpeed).toBe(1)
  })

  it('should toggle showShadows', () => {
    const { result } = renderHook(() => useViewerSettingsStore())

    act(() => {
      result.current.setSetting('showShadows', false)
    })

    expect(result.current.settings.showShadows).toBe(false)
  })

  it('should update numeric settings', () => {
    const { result } = renderHook(() => useViewerSettingsStore())

    act(() => {
      result.current.setSetting('orbitSpeed', 1.5)
    })
    expect(result.current.settings.orbitSpeed).toBe(1.5)

    act(() => {
      result.current.setSetting('zoomSpeed', 0.5)
    })
    expect(result.current.settings.zoomSpeed).toBe(0.5)

    act(() => {
      result.current.setSetting('panSpeed', 2)
    })
    expect(result.current.settings.panSpeed).toBe(2)

    act(() => {
      result.current.setSetting('modelRotationSpeed', 0.01)
    })
    expect(result.current.settings.modelRotationSpeed).toBe(0.01)
  })

  it('should replace all settings with setSettings', () => {
    const { result } = renderHook(() => useViewerSettingsStore())

    const newSettings = {
      orbitSpeed: 2,
      zoomSpeed: 0.5,
      panSpeed: 1.5,
      modelRotationSpeed: 0.01,
      showShadows: false,
      showStats: true,
    }

    act(() => {
      result.current.setSettings(newSettings)
    })

    expect(result.current.settings).toEqual(newSettings)
  })

  it('should reset settings to defaults', () => {
    const { result } = renderHook(() => useViewerSettingsStore())

    act(() => {
      result.current.setSetting('showStats', true)
      result.current.setSetting('orbitSpeed', 2)
    })

    expect(result.current.settings.showStats).toBe(true)
    expect(result.current.settings.orbitSpeed).toBe(2)

    act(() => {
      result.current.resetSettings()
    })

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
  })
})
