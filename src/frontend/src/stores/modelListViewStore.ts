import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface PersistedModelCategorySelectionState {
  checked?: boolean
  partialChecked?: boolean
}

export type PersistedModelCategorySelectionKeys = Record<
  string,
  PersistedModelCategorySelectionState
>

export interface ModelListViewState {
  isSearchOpen: boolean
  isFiltersOpen: boolean
  searchQuery: string
  selectedPackIds: number[]
  selectedProjectIds: number[]
  selectedCategoryKeys: PersistedModelCategorySelectionKeys
  selectedTagNames: string[]
  hasConceptImages: boolean
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
  selectedCategoryKeys: {},
  selectedTagNames: [],
  hasConceptImages: false,
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
    }
  )
)
