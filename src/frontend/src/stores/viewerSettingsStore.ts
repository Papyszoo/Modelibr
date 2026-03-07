import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface ViewerSettingsState {
  orbitSpeed: number
  zoomSpeed: number
  panSpeed: number
  modelRotationSpeed: number
  showShadows: boolean
  showStats: boolean
}

interface ViewerSettingsStore {
  settings: ViewerSettingsState
  setSetting: <K extends keyof ViewerSettingsState>(
    key: K,
    value: ViewerSettingsState[K]
  ) => void
  setSettings: (settings: ViewerSettingsState) => void
  resetSettings: () => void
}

const DEFAULT_SETTINGS: ViewerSettingsState = {
  orbitSpeed: 1,
  zoomSpeed: 1,
  panSpeed: 1,
  modelRotationSpeed: 0.002,
  showShadows: true,
  showStats: false,
}

export const useViewerSettingsStore = create<ViewerSettingsStore>()(
  persist(
    set => ({
      settings: { ...DEFAULT_SETTINGS },
      setSetting: (key, value) =>
        set(state => ({
          settings: { ...state.settings, [key]: value },
        })),
      setSettings: settings => set({ settings }),
      resetSettings: () => set({ settings: { ...DEFAULT_SETTINGS } }),
    }),
    {
      name: 'modelibr_viewer_settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
