import { renderHook, act } from '@testing-library/react'
import { useThemeStore } from '@/stores/themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should initialize with light theme by default', () => {
    const { result } = renderHook(() => useThemeStore())
    expect(result.current.theme).toBe('light')
  })

  it('should set theme to dark', () => {
    const { result } = renderHook(() => useThemeStore())

    act(() => {
      result.current.setTheme('dark')
    })

    expect(result.current.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('should set theme to light', () => {
    const { result } = renderHook(() => useThemeStore())

    act(() => {
      result.current.setTheme('light')
    })

    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('should persist theme in localStorage', () => {
    const { result } = renderHook(() => useThemeStore())

    act(() => {
      result.current.setTheme('dark')
    })

    expect(localStorage.getItem('theme')).toBe('dark')

    // Simulate a new hook instance (e.g., page refresh)
    const { result: newResult } = renderHook(() => useThemeStore())
    expect(newResult.current.theme).toBe('dark')
  })
})
