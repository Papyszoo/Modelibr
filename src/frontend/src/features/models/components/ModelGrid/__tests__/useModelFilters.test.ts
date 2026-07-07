import { act, renderHook } from '@testing-library/react'

import {
  ALL_CATEGORIES_ID,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'
import { type Model } from '@/utils/fileUtils'

import { useModelFilters } from '../useModelFilters'

const models = [
  { id: 1, name: 'Knight', categoryId: 5 },
  { id: 2, name: 'Goblin', categoryId: 5 },
  { id: 3, name: 'Rock', categoryId: 9 },
  { id: 4, name: 'Loose', categoryId: null },
] as unknown as Model[]

describe('useModelFilters — active-category client filter', () => {
  it('returns every model for the All bucket (default)', () => {
    const { result } = renderHook(() => useModelFilters({}))
    expect(result.current.activeCategoryId).toBe(ALL_CATEGORIES_ID)
    expect(result.current.filterModels(models)).toHaveLength(4)
  })

  it('returns only uncategorized models for the Unassigned bucket', () => {
    const { result } = renderHook(() => useModelFilters({}))
    act(() => result.current.setActiveCategoryId(UNASSIGNED_CATEGORY_ID))
    const filtered = result.current.filterModels(models)
    expect(filtered.map(m => m.id)).toEqual([4])
  })

  it('returns only the models in the selected category', () => {
    const { result } = renderHook(() => useModelFilters({}))
    act(() => result.current.setActiveCategoryId(5))
    const filtered = result.current.filterModels(models)
    expect(filtered.map(m => m.id)).toEqual([1, 2])
  })

  it('combines the active category with the search query', () => {
    const { result } = renderHook(() => useModelFilters({}))
    act(() => {
      result.current.setActiveCategoryId(5)
      result.current.setSearchQuery('gob')
    })
    const filtered = result.current.filterModels(models)
    expect(filtered.map(m => m.id)).toEqual([2])
  })
})
