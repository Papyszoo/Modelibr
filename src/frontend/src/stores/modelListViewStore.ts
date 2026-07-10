import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { ALL_CATEGORIES_ID } from '@/shared/types/categories'

export interface ModelListViewState {
  isSearchOpen: boolean
  isFiltersOpen: boolean
  searchQuery: string
  selectedPackIds: number[]
  selectedProjectIds: number[]
  /** Single active category; ALL_CATEGORIES_ID = all, UNASSIGNED = uncategorized. */
  activeCategoryId: number | null
  selectedTagNames: string[]
  hasConceptImages: boolean
  animatedOnly: boolean
  minTriangleCount: number | null
  maxTriangleCount: number | null
  selectedModelIds: string[]
}

interface ModelListViewStore {
  views: Record<string, ModelListViewState>
  setViewState: (scopeKey: string, patch: Partial<ModelListViewState>) => void
  clearViewState: (scopeKey: string) => void
}

export const DEFAULT_MODEL_LIST_VIEW_STATE: ModelListViewState = {
  isSearchOpen: false,
  isFiltersOpen: false,
  searchQuery: '',
  selectedPackIds: [],
  selectedProjectIds: [],
  activeCategoryId: ALL_CATEGORIES_ID,
  selectedTagNames: [],
  hasConceptImages: false,
  animatedOnly: false,
  minTriangleCount: null,
  maxTriangleCount: null,
  selectedModelIds: [],
}

export const useModelListViewStore = create<ModelListViewStore>()(
  persist(
    set => ({
      views: {},
      setViewState: (scopeKey, patch) => {
        set(state => ({
          views: {
            ...state.views,
            [scopeKey]: {
              ...(state.views[scopeKey] ?? DEFAULT_MODEL_LIST_VIEW_STATE),
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
      name: 'model-list-view-state',
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
        const views: Record<string, ModelListViewState> = {}
        for (const [scope, view] of Object.entries(state.views)) {
          const { selectedCategoryKeys: _drop, ...rest } = view
          views[scope] = {
            ...DEFAULT_MODEL_LIST_VIEW_STATE,
            ...(rest as Partial<ModelListViewState>),
            activeCategoryId: ALL_CATEGORIES_ID,
          }
        }
        return { views }
      },
    }
  )
)
