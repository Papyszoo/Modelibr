import { create } from 'zustand'

export type ThumbnailAnimationMode = 'autoplay' | 'onHover' | 'static'

interface ThumbnailAnimationStore {
  mode: ThumbnailAnimationMode
  setMode: (mode: ThumbnailAnimationMode) => void
}

const STORAGE_KEY = 'thumbnailAnimationMode'
const DEFAULT_MODE: ThumbnailAnimationMode = 'autoplay'

const isMode = (value: unknown): value is ThumbnailAnimationMode =>
  value === 'autoplay' || value === 'onHover' || value === 'static'

const getInitialMode = (): ThumbnailAnimationMode => {
  if (typeof window === 'undefined') {
    return DEFAULT_MODE
  }
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isMode(stored) ? stored : DEFAULT_MODE
}

export const useThumbnailAnimationStore = create<ThumbnailAnimationStore>(
  set => ({
    mode: getInitialMode(),
    setMode: (mode: ThumbnailAnimationMode) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, mode)
      }
      set({ mode })
    },
  })
)

// Keep this tab's store in sync when another tab changes the setting —
// otherwise the in-memory mode would diverge from localStorage until a
// page reload. The `storage` event only fires for cross-tab writes, so
// the same-tab `setMode` path is not re-entered.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return
    const next = isMode(event.newValue) ? event.newValue : DEFAULT_MODE
    useThumbnailAnimationStore.setState({ mode: next })
  })
}
