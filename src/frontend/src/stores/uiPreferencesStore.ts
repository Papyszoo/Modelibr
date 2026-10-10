import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { type TabType } from '@/types'

/**
 * Where the dock bar lives on a mobile-sized viewport.
 *  - `left`   - vertical bar on the left (default; mirrors desktop layout)
 *  - `bottom` - horizontal bar at the bottom (native-app style)
 *  - `top`    - horizontal bar at the top
 */
export type MobileBarPosition = 'top' | 'bottom' | 'left'

export interface UIPreferencesState {
  mobileBarPosition: MobileBarPosition
  /**
   * Main-dock pages kept always present and not closable (see
   * `components/layout/dock-panel/pinnedTabs.ts` for the catalogue). Order is
   * not significant here: consumers render in catalogue order.
   */
  pinnedTabTypes: TabType[]
}

interface UIPreferencesStore extends UIPreferencesState {
  setMobileBarPosition: (position: MobileBarPosition) => void
  setPinnedTabType: (type: TabType, pinned: boolean) => void
  reset: () => void
}

const DEFAULTS: UIPreferencesState = {
  mobileBarPosition: 'left',
  // Models and Projects are pinned out of the box; the other main pages behave
  // as ordinary tabs.
  pinnedTabTypes: ['modelList', 'projects'],
}

export const useUIPreferencesStore = create<UIPreferencesStore>()(
  persist(
    set => ({
      ...DEFAULTS,
      setMobileBarPosition: position => set({ mobileBarPosition: position }),
      setPinnedTabType: (type, pinned) =>
        set(state => ({
          pinnedTabTypes: pinned
            ? state.pinnedTabTypes.includes(type)
              ? state.pinnedTabTypes
              : [...state.pinnedTabTypes, type]
            : state.pinnedTabTypes.filter(t => t !== type),
        })),
      reset: () =>
        set({ ...DEFAULTS, pinnedTabTypes: [...DEFAULTS.pinnedTabTypes] }),
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
