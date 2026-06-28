import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface ViewerSettingsState {
  orbitSpeed: number
  zoomSpeed: number
  panSpeed: number
  modelRotationSpeed: number
  showShadows: boolean
  showStats: boolean
  showPerf: boolean
  // Lights
  ambientIntensity: number
  directionalIntensity: number
  showLightHelpers: boolean
  // Environment
  environmentPreset: string
  showEnvironmentBackground: boolean
  backgroundIntensity: number
  environmentIntensity: number
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
  showPerf: false,
  // Defaults mirror the shared rig (asset-processor/lib/sceneLighting.js
  // DEFAULT_LIGHTING) so an unconfigured viewer matches the thumbnail render.
  // ambient/environment are absolute intensities; directional is a multiplier.
  ambientIntensity: 0.35,
  directionalIntensity: 1.0,
  showLightHelpers: false,
  environmentPreset: 'city',
  showEnvironmentBackground: false,
  backgroundIntensity: 1.0,
  environmentIntensity: 0.3,
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
      merge: (persisted, current) => ({
        ...current,
        settings: {
          ...DEFAULT_SETTINGS,
          ...((persisted as ViewerSettingsStore).settings ?? {}),
        },
      }),
    }
  )
)
