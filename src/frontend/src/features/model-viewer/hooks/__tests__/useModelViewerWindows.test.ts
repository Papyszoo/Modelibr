import { act, renderHook } from '@testing-library/react'

import { useModelViewerWindows } from '../useModelViewerWindows'

describe('useModelViewerWindows', () => {
  it('should start with all windows closed', () => {
    const { result } = renderHook(() => useModelViewerWindows())
    const { visibility } = result.current

    expect(visibility.info).toBe(false)
    expect(visibility.thumbnail).toBe(false)
    expect(visibility.hierarchy).toBe(false)
    expect(visibility.settings).toBe(false)
    expect(visibility.uvMap).toBe(false)
    expect(visibility.textureSet).toBe(false)
    expect(visibility.version).toBe(false)
  })

  it('should toggle a closed window to open', () => {
    const { result } = renderHook(() => useModelViewerWindows())

    act(() => {
      result.current.toggle('info')
    })

    expect(result.current.visibility.info).toBe(true)
  })

  it('should toggle an open window to closed', () => {
    const { result } = renderHook(() => useModelViewerWindows())

    act(() => {
      result.current.toggle('settings')
    })
    expect(result.current.visibility.settings).toBe(true)

    act(() => {
      result.current.toggle('settings')
    })
    expect(result.current.visibility.settings).toBe(false)
  })

  it('should close an open window', () => {
    const { result } = renderHook(() => useModelViewerWindows())

    act(() => {
      result.current.toggle('thumbnail')
    })
    expect(result.current.visibility.thumbnail).toBe(true)

    act(() => {
      result.current.close('thumbnail')
    })
    expect(result.current.visibility.thumbnail).toBe(false)
  })

  it('should not affect other windows when toggling one', () => {
    const { result } = renderHook(() => useModelViewerWindows())

    act(() => {
      result.current.toggle('info')
      result.current.toggle('hierarchy')
    })

    expect(result.current.visibility.info).toBe(true)
    expect(result.current.visibility.hierarchy).toBe(true)
    expect(result.current.visibility.settings).toBe(false)
    expect(result.current.visibility.thumbnail).toBe(false)
    expect(result.current.visibility.uvMap).toBe(false)
    expect(result.current.visibility.textureSet).toBe(false)
    expect(result.current.visibility.version).toBe(false)
  })

  it('should close only the specified window', () => {
    const { result } = renderHook(() => useModelViewerWindows())

    act(() => {
      result.current.toggle('info')
      result.current.toggle('hierarchy')
    })

    act(() => {
      result.current.close('info')
    })

    expect(result.current.visibility.info).toBe(false)
    expect(result.current.visibility.hierarchy).toBe(true)
  })

  it('close on already-closed window is a no-op', () => {
    const { result } = renderHook(() => useModelViewerWindows())

    act(() => {
      result.current.close('uvMap')
    })

    expect(result.current.visibility.uvMap).toBe(false)
  })
})
