import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { type CategorySelectionKeys } from '@/shared/types/categories'

export interface EnvironmentMapListViewState {
  isSearchOpen: boolean
  isFiltersOpen: boolean
  searchQuery: string
  selectedPreviewSizes: string[]
  selectedPackIds: number[]
  selectedProjectIds: number[]
  selectedCategoryKeys: CategorySelectionKeys
  onlyCustomThumbnail: boolean
}

interface EnvironmentMapListViewStore {
  views: Record<string, EnvironmentMapListViewState>
  setViewState: (
    scopeKey: string,
    patch: Partial<EnvironmentMapListViewState>
  ) => void
  clearViewState: (scopeKey: string) => void
}

export const DEFAULT_ENV_MAP_LIST_VIEW_STATE: EnvironmentMapListViewState = {
  isSearchOpen: false,
  isFiltersOpen: false,
  searchQuery: '',
  selectedPreviewSizes: [],
  selectedPackIds: [],
  selectedProjectIds: [],
  selectedCategoryKeys: {},
  onlyCustomThumbnail: false,
}

export const useEnvironmentMapListViewStore =
  create<EnvironmentMapListViewStore>()(
    persist(
      set => ({
        views: {},
        setViewState: (scopeKey, patch) => {
          set(state => ({
            views: {
              ...state.views,
              [scopeKey]: {
                ...(state.views[scopeKey] ?? DEFAULT_ENV_MAP_LIST_VIEW_STATE),
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
        name: 'environment-map-list-view-state',
        storage: createJSONStorage(() => localStorage),
        partialize: state => ({ views: state.views }),
      }
    )
  )
