import { create } from 'zustand'

export type Theme = 'light' | 'dark'

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
}

// Get initial theme from localStorage or default to 'light'
const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return 'light'
}

export const useThemeStore = create<ThemeStore>(set => ({
  theme: getInitialTheme(),
  setTheme: (theme: Theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },
}))
