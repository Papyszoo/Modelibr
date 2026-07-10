import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { ALL_CATEGORIES_ID } from '@/shared/types/categories'

export interface EnvironmentMapListViewState {
  isSearchOpen: boolean
  isFiltersOpen: boolean
  searchQuery: string
  selectedPreviewSizes: string[]
  selectedPackIds: number[]
  selectedProjectIds: number[]
  /** Single active category; ALL_CATEGORIES_ID = all, UNASSIGNED = uncategorized. */
  activeCategoryId: number | null
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
  activeCategoryId: ALL_CATEGORIES_ID,
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
        // v1: the multi-select `selectedCategoryKeys` filter was replaced by a
        // single-select `activeCategoryId` sidebar. Drop the old key and default
        // every persisted view to "All" so stale checkbox state can't leak in.
        version: 1,
        migrate: persisted => {
          const state = persisted as
            | { views?: Record<string, Record<string, unknown>> }
            | undefined
          if (!state?.views) {
            return { views: {} }
          }
          const views: Record<string, EnvironmentMapListViewState> = {}
          for (const [scope, view] of Object.entries(state.views)) {
            const { selectedCategoryKeys: _drop, ...rest } = view
            views[scope] = {
              ...DEFAULT_ENV_MAP_LIST_VIEW_STATE,
              ...(rest as Partial<EnvironmentMapListViewState>),
              activeCategoryId: ALL_CATEGORIES_ID,
            }
          }
          return { views }
        },
      }
    )
  )
