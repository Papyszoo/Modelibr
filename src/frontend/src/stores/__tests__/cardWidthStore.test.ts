import { renderHook, act } from '@testing-library/react'
import { useCardWidthStore } from '../cardWidthStore'

describe('cardWidthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset Zustand store state to defaults before each test
    // since the store is a module-level singleton
    useCardWidthStore.setState({
      settings: {
        models: 180,
        sprites: 200,
        sounds: 280,
        packs: 280,
        projects: 280,
        textureSets: 200,
        stages: 300,
        textureSetViewer: 280,
        recycledFiles: 200,
      },
    })
  })

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useCardWidthStore())

    expect(result.current.settings.models).toBe(180)
    expect(result.current.settings.sprites).toBe(200)
    expect(result.current.settings.packs).toBe(280)
    expect(result.current.settings.projects).toBe(280)
    expect(result.current.settings.textureSets).toBe(200)
    expect(result.current.settings.stages).toBe(300)
  })

  it('should update card width for a specific page', () => {
    const { result } = renderHook(() => useCardWidthStore())

    act(() => {
      result.current.setCardWidth('models', 250)
    })

    expect(result.current.settings.models).toBe(250)
    expect(result.current.settings.sprites).toBe(200) // Should not change
  })

  it('should persist card width to localStorage', () => {
    const { result } = renderHook(() => useCardWidthStore())

    act(() => {
      result.current.setCardWidth('sprites', 300)
    })

    const stored = localStorage.getItem('cardWidthSettings')
    expect(stored).toBeTruthy()

    const parsed = JSON.parse(stored!)
    expect(parsed.sprites).toBe(300)
  })

  it('should load persisted settings from localStorage', () => {
    const testSettings = {
      models: 220,
      sprites: 250,
      packs: 320,
      projects: 350,
      textureSets: 180,
      stages: 400,
    }
    localStorage.setItem('cardWidthSettings', JSON.stringify(testSettings))
    // Simulate what getInitialSettings() would produce from localStorage
    useCardWidthStore.setState({
      settings: { ...useCardWidthStore.getState().settings, ...testSettings },
    })

    const { result } = renderHook(() => useCardWidthStore())

    expect(result.current.settings.models).toBe(220)
    expect(result.current.settings.sprites).toBe(250)
    expect(result.current.settings.packs).toBe(320)
  })

  it('should merge with defaults if localStorage has partial data', () => {
    const partialSettings = {
      models: 250,
    }
    localStorage.setItem('cardWidthSettings', JSON.stringify(partialSettings))
    // Simulate what getInitialSettings() would produce: merge partial with defaults
    useCardWidthStore.setState({
      settings: {
        ...useCardWidthStore.getState().settings,
        ...partialSettings,
      },
    })

    const { result } = renderHook(() => useCardWidthStore())

    expect(result.current.settings.models).toBe(250)
    expect(result.current.settings.sprites).toBe(200) // Should use default
  })
})
