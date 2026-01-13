import { create } from 'zustand'

export type PageType =
  | 'models'
  | 'sprites'
  | 'packs'
  | 'projects'
  | 'textureSets'
  | 'stages'
  | 'textureSetViewer'
  | 'recycledFiles'

interface CardWidthSettings {
  models: number
  sprites: number
  packs: number
  projects: number
  textureSets: number
  stages: number
  textureSetViewer: number
  recycledFiles: number
}

interface CardWidthStore {
  settings: CardWidthSettings
  setCardWidth: (page: PageType, width: number) => void
}

// Default card widths (min values from CSS)
const DEFAULT_WIDTHS: CardWidthSettings = {
  models: 180,
  sprites: 200,
  packs: 280,
  projects: 280,
  textureSets: 200,
  stages: 300,
  textureSetViewer: 280,
  recycledFiles: 200,
}

// Get initial settings from localStorage or defaults
const getInitialSettings = (): CardWidthSettings => {
  const stored = localStorage.getItem('cardWidthSettings')
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      // Merge with defaults to ensure all pages have a value
      return { ...DEFAULT_WIDTHS, ...parsed }
    } catch {
      return DEFAULT_WIDTHS
    }
  }
  return DEFAULT_WIDTHS
}

export const useCardWidthStore = create<CardWidthStore>(set => ({
  settings: getInitialSettings(),
  setCardWidth: (page: PageType, width: number) => {
    set(state => {
      const newSettings = { ...state.settings, [page]: width }
      localStorage.setItem('cardWidthSettings', JSON.stringify(newSettings))
      return { settings: newSettings }
    })
  },
}))
