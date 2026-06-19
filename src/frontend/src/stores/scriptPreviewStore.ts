import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type PreviewGeometry = 'sphere' | 'box' | 'plane' | 'cylinder' | 'torus'
export type PreviewPanelPosition = 'right' | 'bottom'

interface ScriptPreviewStore {
  /** Where the preview pane sits relative to the editor. */
  panelPosition: PreviewPanelPosition
  /** Primitive the user material is applied to (used when modelId is null). */
  geometry: PreviewGeometry
  /** When set, the material is applied to this library model instead. */
  modelId: number | null
  setPanelPosition: (position: PreviewPanelPosition) => void
  /** Choosing a primitive also drops any selected library model. */
  setGeometry: (geometry: PreviewGeometry) => void
  setModelId: (modelId: number | null) => void
}

export const useScriptPreviewStore = create<ScriptPreviewStore>()(
  persist(
    set => ({
      panelPosition: 'right',
      geometry: 'sphere',
      modelId: null,
      setPanelPosition: panelPosition => set({ panelPosition }),
      setGeometry: geometry => set({ geometry, modelId: null }),
      setModelId: modelId => set({ modelId }),
    }),
    {
      name: 'modelibr_script_preview',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
