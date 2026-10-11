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
  /**
   * Section shown in the Settings page nav. Persisted so the last edited
   * section is the one the page opens on. Stored as a plain string: the
   * section catalogue lives in the Settings component and the store must not
   * depend on it; Settings falls back to its first section for an unknown key.
   */
  settingsSection: string
}

interface UIPreferencesStore extends UIPreferencesState {
  setMobileBarPosition: (position: MobileBarPosition) => void
  setPinnedTabType: (type: TabType, pinned: boolean) => void
  setSettingsSection: (section: string) => void
  reset: () => void
}

const DEFAULTS: UIPreferencesState = {
  mobileBarPosition: 'left',
  // Models and Projects are pinned out of the box; the other main pages behave
  // as ordinary tabs.
  pinnedTabTypes: ['modelList', 'projects'],
  settingsSection: 'appearance',
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
      setSettingsSection: section => set({ settingsSection: section }),
      reset: () =>
        set({
          ...DEFAULTS,
          pinnedTabTypes: [...DEFAULTS.pinnedTabTypes],
        }),
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
