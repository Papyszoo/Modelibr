import { act, renderHook } from '@testing-library/react'

import {
  sceneViewportDpr,
  useSceneViewportQuality,
} from '../useSceneViewportQuality'

describe('scene viewport quality', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('uses visibly lower raster quality while moving and restores it in stages', () => {
    // Regression: the editor always rendered at up to 2x DPR with dynamic shadows, so
    // camera movement competed with scene loading for the same frame. Exercise the actual
    // start/end mutation to prove moving, settling and still are distinct policies.
    const { result } = renderHook(() => useSceneViewportQuality(true))

    expect(result.current.state).toBe('still')
    act(() => result.current.onControlsStart())
    expect(result.current.state).toBe('moving')
    expect(result.current.dpr).toBe(1)
    expect(result.current.shadowsEnabled).toBe(false)

    act(() => result.current.onControlsEnd())
    expect(result.current.state).toBe('settling')
    expect(result.current.dpr).toBeLessThanOrEqual(1.5)

    act(() => jest.advanceTimersByTime(180))
    expect(result.current.state).toBe('still')
    expect(result.current.shadowsEnabled).toBe(true)
  })

  it('debounces control changes that happen without a pointer gesture', () => {
    // Regression: damping and programmatic camera changes can arrive without start/end.
    // Mutating through `change` must still lower quality, then settle after changes stop.
    const { result } = renderHook(() => useSceneViewportQuality(true))

    act(() => result.current.onControlsChange())
    expect(result.current.state).toBe('moving')

    act(() => jest.advanceTimersByTime(90))
    expect(result.current.state).toBe('settling')
    act(() => jest.advanceTimersByTime(180))
    expect(result.current.state).toBe('still')
  })

  it('keeps headless rendering at final quality', () => {
    // Regression: the render view shares SceneCanvas, so editor adaptation must never make
    // a supposedly final screenshot use moving-quality DPR or disabled shadows.
    const { result } = renderHook(() => useSceneViewportQuality(false))

    act(() => result.current.onControlsStart())
    expect(result.current.state).toBe('still')
    expect(result.current.shadowsEnabled).toBe(true)
  })

  it('caps final DPR but never raises a low-density display above native', () => {
    // The pure budget is covered separately so a future state transition cannot hide a DPR
    // regression. Varying device density proves both the cap and native-resolution path.
    expect(sceneViewportDpr('still', 3)).toBe(2)
    expect(sceneViewportDpr('still', 1)).toBe(1)
    expect(sceneViewportDpr('moving', 3)).toBe(1)
  })
})
