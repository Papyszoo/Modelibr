import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { ALL_CATEGORIES_ID } from '@/shared/types/categories'

/**
 * Persisted state for a single texture-set list "view" (one tab on one
 * side of the dock). Mirrors `modelListViewStore` so that texture-set
 * pages get the same per-tab persistence parity Models has.
 */
export interface TextureSetListViewState {
  isSearchOpen: boolean
  isFiltersOpen: boolean
  searchQuery: string
  selectedPackIds: number[]
  selectedProjectIds: number[]
  /** Single active category; ALL_CATEGORIES_ID = all, UNASSIGNED = uncategorized. */
  activeCategoryId: number | null
  /** Subset of `TextureType` enum values (numeric). */
  selectedTextureTypes: number[]
  /** Minimum largest-side resolution filter (e.g. 4096 = "4K and up"); null = any. */
  minResolution: number | null
  /** Tag names (shared vocabulary) used as an any-of filter. */
  selectedTagNames: string[]
  /** Persists across tab navigation so a selection survives re-mount. */
  selectedTextureSetIds: number[]
}

interface TextureSetListViewStore {
  views: Record<string, TextureSetListViewState>
  setViewState: (
    scopeKey: string,
    patch: Partial<TextureSetListViewState>
  ) => void
  clearViewState: (scopeKey: string) => void
}

export const DEFAULT_TEXTURE_SET_LIST_VIEW_STATE: TextureSetListViewState = {
  isSearchOpen: false,
  isFiltersOpen: false,
  searchQuery: '',
  selectedPackIds: [],
  selectedProjectIds: [],
  activeCategoryId: ALL_CATEGORIES_ID,
  selectedTextureTypes: [],
  minResolution: null,
  selectedTagNames: [],
  selectedTextureSetIds: [],
}

export const useTextureSetListViewStore = create<TextureSetListViewStore>()(
  persist(
    set => ({
      views: {},
      setViewState: (scopeKey, patch) => {
        set(state => ({
          views: {
            ...state.views,
            [scopeKey]: {
              ...(state.views[scopeKey] ?? DEFAULT_TEXTURE_SET_LIST_VIEW_STATE),
              ...patch,
            },
          },
        }))
      },
      clearViewState: scopeKey => {
        set(state => {
          const { [scopeKey]: _, ...rest } = state.views
          return { views: rest }
        })
      },
    }),
    {
      name: 'texture-set-list-view-state',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ views: state.views }),
      // Backfill fields added after a view was first persisted (e.g.
      // selectedProjectIds) so consumers can read them without guards. Also
      // drops the legacy multi-select `selectedCategoryKeys` — the category
      // filter is now the single-select `activeCategoryId` sidebar, defaulted
      // to "All" for any view persisted before the switch.
      merge: (persisted, current) => {
        const persistedViews =
          (persisted as { views?: Record<string, Record<string, unknown>> })
            ?.views ?? {}
        const views = Object.fromEntries(
          Object.entries(persistedViews).map(([scope, view]) => {
            const { selectedCategoryKeys: _drop, ...rest } = view
            return [
              scope,
              {
                ...DEFAULT_TEXTURE_SET_LIST_VIEW_STATE,
                ...(rest as Partial<TextureSetListViewState>),
              },
            ]
          })
        )
        return { ...current, views }
      },
    }
  )
)
