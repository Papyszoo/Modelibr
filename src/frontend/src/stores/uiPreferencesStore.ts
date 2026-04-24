import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Where the dock bar lives on a mobile-sized viewport.
 *  - `left`   — vertical bar on the left (default; mirrors desktop layout)
 *  - `bottom` — horizontal bar at the bottom (native-app style)
 *  - `top`    — horizontal bar at the top
 */
export type MobileBarPosition = 'top' | 'bottom' | 'left'

export interface UIPreferencesState {
  mobileBarPosition: MobileBarPosition
}

interface UIPreferencesStore extends UIPreferencesState {
  setMobileBarPosition: (position: MobileBarPosition) => void
  reset: () => void
}

const DEFAULTS: UIPreferencesState = {
  mobileBarPosition: 'left',
}

export const useUIPreferencesStore = create<UIPreferencesStore>()(
  persist(
    set => ({
      ...DEFAULTS,
      setMobileBarPosition: position => set({ mobileBarPosition: position }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'modelibr_ui_preferences',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({
        ...current,
        ...DEFAULTS,
        ...((persisted as Partial<UIPreferencesState>) ?? {}),
      }),
    }
  )
)
