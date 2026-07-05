import {
  createTab,
  getTabLabel,
  migrateNavigationState,
  useNavigationStore,
  type WindowState,
} from '@/stores/navigationStore'
import { type Tab } from '@/types'

const store = () => useNavigationStore.getState()
const win = (id = 'w1') => store().activeWindows[id]

beforeEach(() => {
  useNavigationStore.setState({
    activeWindows: {},
    recentlyClosedTabs: [],
    recentlyClosedWindows: [],
  })
  localStorage.clear()
})

describe('createTab', () => {
  it('derives a stable id + params for each entity viewer type', () => {
    expect(createTab('modelViewer', '42').id).toBe('model-42')
    expect(createTab('modelViewer', '42').params.modelId).toBe('42')
    expect(createTab('textureSetViewer', '9').id).toBe('set-9')
    expect(createTab('packViewer', '3').id).toBe('pack-3')
    expect(createTab('projectViewer', '5').id).toBe('project-5')
    expect(createTab('scriptViewer', '7').id).toBe('script-7')
    expect(createTab('scriptViewer', '7').params.scriptId).toBe('7')
  })

  it('uses the entity name as the label, falling back to a type label', () => {
    expect(createTab('modelList').label).toBe('Models')
    expect(createTab('scriptViewer', '7', 'player.lua').label).toBe(
      'player.lua'
    )
    // No name given → getTabLabel fallback with the id.
    expect(createTab('scriptViewer', '7').label).toBe('Script 7')
  })

  it('gives list tabs an id equal to their type (single-instance tabs)', () => {
    expect(createTab('scripts').id).toBe('scripts')
    expect(getTabLabel('scripts')).toBe('Scripts')
  })
})

describe('openTab', () => {
  beforeEach(() => store().initWindow('w1'))

  it('appends a new tab and makes it active', () => {
    store().openTab('w1', 'left', createTab('scripts'))
    expect(win().tabs.map(t => t.id)).toEqual(['modelList', 'scripts'])
    expect(win().activeTabId).toBe('scripts')
  })

  it('does not duplicate an already-open tab — it just re-activates it', () => {
    store().openTab('w1', 'left', createTab('scripts'))
    store().setActiveTab('w1', 'modelList')
    store().openTab('w1', 'left', createTab('scripts'))

    expect(win().tabs.filter(t => t.id === 'scripts')).toHaveLength(1)
    expect(win().activeTabId).toBe('scripts')
  })

  it('routes a right-side tab to the right panel without stealing left focus', () => {
    store().openTab('w1', 'left', createTab('scripts'))
    store().openTab('w1', 'right', createTab('history'))

    const history = win().tabs.find(t => t.id === 'history')
    expect(history?.params?.panel).toBe('right')
    expect(win().activeRightTabId).toBe('history')
    expect(win().activeTabId).toBe('scripts')
  })
})

describe('closeTab active-tab reselection', () => {
  beforeEach(() => {
    store().initWindow('w1')
    store().openTab('w1', 'left', createTab('scripts'))
    store().openTab('w1', 'left', createTab('sounds'))
    // tabs: [modelList, scripts, sounds], active: sounds
  })

  it('activates the previous neighbour when the active tab is closed', () => {
    store().closeTab('w1', 'sounds')
    expect(win().tabs.map(t => t.id)).toEqual(['modelList', 'scripts'])
    expect(win().activeTabId).toBe('scripts')
  })

  it('leaves the active tab untouched when a different tab is closed', () => {
    store().setActiveTab('w1', 'scripts')
    store().closeTab('w1', 'modelList')
    expect(win().activeTabId).toBe('scripts')
  })

  it('sets the active tab to null when the last tab is closed', () => {
    store().closeTab('w1', 'sounds')
    store().closeTab('w1', 'scripts')
    store().closeTab('w1', 'modelList')
    expect(win().tabs).toHaveLength(0)
    expect(win().activeTabId).toBeNull()
  })

  it('records closed tabs newest-first in the recently-closed list', () => {
    store().closeTab('w1', 'sounds')
    store().closeTab('w1', 'scripts')
    expect(store().recentlyClosedTabs.map(t => t.id)).toEqual([
      'scripts',
      'sounds',
    ])
  })

  it('clears the right active tab when the active right tab is closed', () => {
    store().openTab('w1', 'right', createTab('history'))
    expect(win().activeRightTabId).toBe('history')
    store().closeTab('w1', 'history')
    expect(win().activeRightTabId).toBeNull()
  })
})

describe('window lifecycle', () => {
  it('archives a real window on removeWindow', () => {
    store().initWindow('w1')
    store().removeWindow('w1')
    expect(store().activeWindows.w1).toBeUndefined()
    expect(store().recentlyClosedWindows[0]?.windowId).toBe('w1')
  })

  it('is a no-op for an unknown window id (guards against clobbering peer state)', () => {
    // Regression guard: persist writes on every set(), so archiving a window we
    // never initialised would overwrite a peer browser tab's session entry.
    store().removeWindow('never-seen')
    expect(store().recentlyClosedWindows).toHaveLength(0)
  })

  it('garbage-collects windows idle longer than the stale window', () => {
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    useNavigationStore.setState({
      activeWindows: {
        old: {
          tabs: [createTab('modelList')],
          activeTabId: 'modelList',
          activeRightTabId: null,
          splitterSize: 50,
          lastActiveAt: longAgo,
        },
        fresh: {
          tabs: [createTab('modelList')],
          activeTabId: 'modelList',
          activeRightTabId: null,
          splitterSize: 50,
          lastActiveAt: new Date().toISOString(),
        },
      },
    })

    store().gcStaleWindows()
    expect(store().activeWindows.old).toBeUndefined()
    expect(store().activeWindows.fresh).toBeDefined()
    expect(store().recentlyClosedWindows.map(e => e.windowId)).toContain('old')
  })
})

describe('recently-closed cap', () => {
  it('keeps at most 10 recently-closed tabs, newest first', () => {
    for (let i = 0; i < 12; i++) {
      store().addRecentlyClosedTab(createTab('modelViewer', String(i)))
    }
    const ids = store().recentlyClosedTabs.map(t => t.id)
    expect(ids).toHaveLength(10)
    expect(ids[0]).toBe('model-11')
    expect(ids).not.toContain('model-0')
  })
})

describe('migrateNavigationState (v0 → v1)', () => {
  // Regression guard: the legacy 'textureSets' tab type was removed from the
  // TabType union after the Global Materials / Multi-Model Textures split.
  // Without this migration, a years-old persisted layout containing such a
  // tab would fall through TabContent's switch and render an empty tab.
  const legacyTab = {
    id: 'textureSets',
    type: 'textureSets',
    label: 'Texture Sets',
    params: {},
    internalUiState: {},
  } as unknown as Tab

  const windowWith = (tabs: Tab[]): WindowState => ({
    tabs,
    activeTabId: tabs[0]?.id ?? null,
    activeRightTabId: null,
    splitterSize: 50,
    lastActiveAt: new Date().toISOString(),
  })

  it('rewrites legacy textureSets tabs everywhere they can be persisted', () => {
    const modelTab = createTab('modelList')
    const migrated = migrateNavigationState(
      {
        activeWindows: { w1: windowWith([legacyTab, modelTab]) },
        recentlyClosedTabs: [legacyTab],
        recentlyClosedWindows: [
          {
            closedAt: '2026-01-01T00:00:00Z',
            windowId: 'w0',
            state: windowWith([legacyTab]),
          },
        ],
      },
      0
    ) as {
      activeWindows: Record<string, WindowState>
      recentlyClosedTabs: Tab[]
      recentlyClosedWindows: { state: WindowState }[]
    }

    const openTabs = migrated.activeWindows.w1.tabs
    expect(openTabs[0].type).toBe('modelTextures')
    expect(openTabs[0].label).toBe('Multi-Model Textures')
    // Singleton ids follow the type, and the active-tab pointer follows the id.
    expect(openTabs[0].id).toBe('modelTextures')
    expect(migrated.activeWindows.w1.activeTabId).toBe('modelTextures')
    // Untouched tabs pass through unchanged.
    expect(openTabs[1]).toEqual(modelTab)
    expect(migrated.recentlyClosedTabs[0].type).toBe('modelTextures')
    expect(migrated.recentlyClosedWindows[0].state.tabs[0].type).toBe(
      'modelTextures'
    )
  })

  it('keeps a user-renamed label instead of forcing the successor label', () => {
    const renamed = { ...legacyTab, label: 'My textures' }
    const migrated = migrateNavigationState(
      { activeWindows: { w1: windowWith([renamed as Tab]) } },
      0
    ) as { activeWindows: Record<string, WindowState> }
    expect(migrated.activeWindows.w1.tabs[0].label).toBe('My textures')
  })

  it('leaves already-migrated state untouched', () => {
    const state = { activeWindows: {}, recentlyClosedTabs: [] }
    expect(migrateNavigationState(state, 1)).toBe(state)
  })
})
