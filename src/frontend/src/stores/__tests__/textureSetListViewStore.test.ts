import { ALL_CATEGORIES_ID } from '@/shared/types/categories'

const STORAGE_KEY = 'texture-set-list-view-state'

// The store is a persist-backed singleton created at import time, so each case
// seeds localStorage first, then re-imports the module in isolation to observe
// what the persist config rehydrates.
async function loadStoreWith(persisted: unknown) {
  localStorage.clear()
  if (persisted !== undefined) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  }
  let views: Record<string, Record<string, unknown>> = {}
  await jest.isolateModulesAsync(async () => {
    const mod = await import('@/stores/textureSetListViewStore')
    views = mod.useTextureSetListViewStore.getState().views as Record<
      string,
      Record<string, unknown>
    >
  })
  return views
}

describe('textureSetListViewStore persistence migration', () => {
  afterEach(() => {
    localStorage.clear()
  })

  // Regression: a view persisted before the sidebar switch carries the legacy
  // multi-select `selectedCategoryKeys`. If migration failed to run (wrong
  // version) or failed to strip the key, stale checkbox state would leak into
  // the single-select `activeCategoryId` model.
  it('drops legacy selectedCategoryKeys and resets to All on the v0→v1 migration', async () => {
    const views = await loadStoreWith({
      version: 0,
      state: {
        views: {
          'models:global': {
            searchQuery: 'brick',
            selectedTextureTypes: [1, 2],
            selectedCategoryKeys: { '5': true, '7': true },
            activeCategoryId: 5,
          },
        },
      },
    })

    const view = views['models:global']
    expect(view).toBeDefined()
    expect('selectedCategoryKeys' in view).toBe(false)
    expect(view.activeCategoryId).toBe(ALL_CATEGORIES_ID)
  })

  // Regression: migration must not clobber unrelated persisted user state.
  it('preserves still-valid persisted fields through migration', async () => {
    const views = await loadStoreWith({
      version: 0,
      state: {
        views: {
          'models:global': {
            searchQuery: 'brick',
            selectedTextureTypes: [1, 2],
            selectedPackIds: [9],
            selectedCategoryKeys: { '5': true },
          },
        },
      },
    })

    const view = views['models:global']
    expect(view.searchQuery).toBe('brick')
    expect(view.selectedTextureTypes).toEqual([1, 2])
    expect(view.selectedPackIds).toEqual([9])
  })

  // Regression: fields added after a view was first persisted (e.g.
  // selectedProjectIds) must be backfilled so consumers can read them without
  // guards — the whole reason the store spreads DEFAULT before persisted state.
  it('backfills fields absent from an older persisted view', async () => {
    const views = await loadStoreWith({
      version: 0,
      state: {
        views: {
          'models:global': {
            searchQuery: 'brick',
          },
        },
      },
    })

    const view = views['models:global']
    expect(view.selectedProjectIds).toEqual([])
    expect(view.selectedTextureSetIds).toEqual([])
    expect(view.minResolution).toBeNull()
  })
})
