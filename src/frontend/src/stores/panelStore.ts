import { create } from 'zustand'

interface PanelStore {
  leftPanelWidth: number
  rightPanelWidth: number
  setLeftPanelWidth: (width: number) => void
  setRightPanelWidth: (width: number) => void
  activeWindowId: string | null
  setActiveWindow: (id: string) => void
}

export const usePanelStore = create<PanelStore>(set => ({
  leftPanelWidth: window.innerWidth / 2,
  rightPanelWidth: window.innerWidth / 2,
  setLeftPanelWidth: (width: number) => set({ leftPanelWidth: width }),
  setRightPanelWidth: (width: number) => set({ rightPanelWidth: width }),
  activeWindowId: null,
  setActiveWindow: (id: string) => set({ activeWindowId: id }),
}))
