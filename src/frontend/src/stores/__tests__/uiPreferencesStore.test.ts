import { useUIPreferencesStore } from '@/stores/uiPreferencesStore'

const store = () => useUIPreferencesStore.getState()

beforeEach(() => {
  localStorage.clear()
  store().reset()
})

describe('uiPreferencesStore pinned tabs', () => {
  it('pins Models and Projects by default', () => {
    expect(store().pinnedTabTypes).toEqual(['modelList', 'projects'])
  })

  it('pins and unpins a main page', () => {
    store().setPinnedTabType('vfxList', true)
    expect(store().pinnedTabTypes).toContain('vfxList')

    store().setPinnedTabType('modelList', false)
    expect(store().pinnedTabTypes).not.toContain('modelList')
    // Unpinning one page leaves the others alone.
    expect(store().pinnedTabTypes).toContain('projects')
  })

  it('does not pin a page twice', () => {
    store().setPinnedTabType('modelList', true)
    expect(
      store().pinnedTabTypes.filter(type => type === 'modelList')
    ).toHaveLength(1)
  })

  // A payload written before pinned tabs existed has no `pinnedTabTypes` key.
  // Rehydrating must fill it from the default instead of dropping it (or
  // clobbering the user's other preferences).
  it('rehydrates a pre-pin payload to the default set, keeping other prefs', async () => {
    localStorage.setItem(
      'modelibr_ui_preferences',
      JSON.stringify({ state: { mobileBarPosition: 'bottom' }, version: 0 })
    )

    await useUIPreferencesStore.persist.rehydrate()

    expect(store().pinnedTabTypes).toEqual(['modelList', 'projects'])
    expect(store().mobileBarPosition).toBe('bottom')
  })
})
