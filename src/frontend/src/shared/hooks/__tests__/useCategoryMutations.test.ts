import { renderHook, waitFor } from '@testing-library/react'

import { useCategoryMutations } from '@/shared/hooks/useCategoryMutations'
import {
  ALL_CATEGORIES_ID,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/renderWithProviders'

// The factory owns the orchestration shared by every asset type's category
// sidebar (toasts, active-id updates, delete-branch fallback, selection
// clearing, invalidation). These tests inject stub behavior and assert that
// orchestration — the payload building lives in each adopter's own test.
const categories = [
  { id: 1, name: 'Characters', path: 'Characters', parentId: null },
  { id: 2, name: 'Humanoid', path: 'Characters / Humanoid', parentId: 1 },
]

type Setup = {
  activeCategoryId?: number | null
  noun?: string
  moveResolves?: number
}

function setup(overrides: Setup = {}) {
  const stubs = {
    showToast: jest.fn(),
    setActiveCategoryId: jest.fn(),
    clearSelection: jest.fn(),
    onCategoriesChanged: jest.fn().mockResolvedValue(undefined),
    onAssetsChanged: jest.fn().mockResolvedValue(undefined),
    createCategory: jest.fn().mockResolvedValue({ id: 99 }),
    renameCategory: jest.fn().mockResolvedValue(undefined),
    deleteCategory: jest.fn().mockResolvedValue(undefined),
    moveToCategory: jest.fn().mockResolvedValue(overrides.moveResolves ?? 1),
  }
  const wrapper = createQueryWrapper(createTestQueryClient())
  const { result } = renderHook(
    () =>
      useCategoryMutations<
        (typeof categories)[number],
        { id: number },
        { categoryId: number | null }
      >({
        ...stubs,
        categories,
        activeCategoryId: overrides.activeCategoryId ?? ALL_CATEGORIES_ID,
        noun: overrides.noun ?? 'model',
      }),
    { wrapper }
  )
  return { result, ...stubs }
}

beforeEach(() => jest.clearAllMocks())

describe('useCategoryMutations', () => {
  it('selects the newly created category and refetches on create', async () => {
    // Regression: dropping setActiveCategoryId(created.id) would leave the user
    // on their old filter after creating a category; skipping the refetch would
    // hide the new node.
    const { result, setActiveCategoryId, onCategoriesChanged } = setup()
    result.current.createCategoryMutation.mutate({ name: 'Props', parentId: 1 })
    await waitFor(() => expect(setActiveCategoryId).toHaveBeenCalledWith(99))
    expect(onCategoriesChanged).toHaveBeenCalled()
  })

  it('forwards the rename payload untouched to the injected renameCategory', async () => {
    // Regression: the factory must not reshape the caller's payload — the
    // adopter builds it to preserve parentId/description/kind.
    const { result, renameCategory } = setup()
    result.current.renameCategoryMutation.mutate({
      category: categories[1],
      name: 'Bipedal',
    })
    await waitFor(() =>
      expect(renameCategory).toHaveBeenCalledWith({
        category: categories[1],
        name: 'Bipedal',
      })
    )
  })

  it('falls back to All when the active selection is inside the deleted branch', async () => {
    // Active = child (2); deleting the parent (1) removes the whole branch, so
    // the selection must reset to All rather than dangling on a gone node.
    const { result, setActiveCategoryId, deleteCategory } = setup({
      activeCategoryId: 2,
    })
    result.current.deleteCategoryMutation.mutate(1)
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith(1))
    await waitFor(() =>
      expect(setActiveCategoryId).toHaveBeenCalledWith(ALL_CATEGORIES_ID)
    )
  })

  it('keeps the active selection when it is outside the deleted branch', async () => {
    const { result, setActiveCategoryId, deleteCategory } = setup({
      activeCategoryId: UNASSIGNED_CATEGORY_ID,
    })
    result.current.deleteCategoryMutation.mutate(2)
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith(2))
    expect(setActiveCategoryId).not.toHaveBeenCalled()
  })

  it('clears the selection and reports the returned moved count (plural)', async () => {
    // Regression: the toast count must come from moveToCategory's RETURN value
    // (e.g. after ModelOwned exclusion), not the input length; and the noun
    // must pluralize. Also verifies the selection is cleared post-move.
    const { result, showToast, clearSelection, onAssetsChanged } = setup({
      moveResolves: 3,
    })
    result.current.moveToCategoryMutation.mutate({ categoryId: 2 })
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ detail: '3 models moved to Humanoid' })
      )
    )
    expect(clearSelection).toHaveBeenCalled()
    expect(onAssetsChanged).toHaveBeenCalled()
  })

  it('uses the capitalized singular noun and Unassigned label for a single move to no category', async () => {
    // Regression: the singular branch must capitalize the noun, and a null
    // target must read "Unassigned" not "Unknown Category".
    const { result, showToast } = setup({
      moveResolves: 1,
      noun: 'texture set',
    })
    result.current.moveToCategoryMutation.mutate({ categoryId: null })
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'Texture set moved to Unassigned' })
      )
    )
  })
})
