import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Tab, TabType } from '@/types'
import { getTabLabel } from '@/utils/tabSerialization'

// ─── Constants ────────────────────────────────────────────────────────
const STORAGE_KEY = 'modelibr_navigation'
const BROADCAST_CHANNEL = 'modelibr_navigation'
const STALE_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours
const MAX_RECENTLY_CLOSED_TABS = 10
const MAX_RECENTLY_CLOSED_WINDOWS = 5
const SESSION_WINDOW_ID_KEY = 'modelibr_windowId'

// ─── Types ────────────────────────────────────────────────────────────

export interface WindowState {
  tabs: Tab[]
  activeTabId: string | null
  /** Splitter percentage for the left panel */
  splitterSize: number
  /** Timestamp of last activity — used for stale-window GC */
  lastActiveAt: string
}

export interface ClosedWindowEntry {
  closedAt: string
  state: WindowState
}

/** Messages sent over BroadcastChannel */
export type NavigationBroadcast =
  | { type: 'TAB_CLOSED'; windowId: string; tab: Tab }
  | {
      type: 'TAB_MOVED'
      sourceWindowId: string
      targetWindowId: string
      tab: Tab
    }
  | { type: 'WINDOW_CLOSED'; windowId: string }
  | { type: 'STATE_SYNC'; windowId: string }

export interface NavigationStore {
  // ── Persisted state ──────────────────────────────────────────────────
  activeWindows: Record<string, WindowState>
  recentlyClosedTabs: Tab[]
  recentlyClosedWindows: ClosedWindowEntry[]

  // ── Actions: window lifecycle ──────────────────────────────────────
  initWindow: (windowId: string) => void
  removeWindow: (windowId: string) => void
  touchWindow: (windowId: string) => void

  // ── Actions: tab management ────────────────────────────────────────
  openTab: (windowId: string, side: 'left' | 'right', tab: Tab) => void
  closeTab: (windowId: string, tabId: string) => void
  setActiveTab: (windowId: string, activeTabId: string) => void
  setTabs: (windowId: string, tabs: Tab[]) => void
  moveTabBetweenPanels: (
    windowId: string,
    tab: Tab,
    fromSide: 'left' | 'right'
  ) => void

  // ── Actions: cross-window tab transfer ─────────────────────────────
  removeTabFromWindow: (windowId: string, tabId: string) => void
  addTabToWindow: (windowId: string, tab: Tab) => void

  // ── Actions: recently closed ───────────────────────────────────────
  addRecentlyClosedTab: (tab: Tab) => void
  removeRecentlyClosedTab: (tabId: string) => void
  restoreWindow: (index: number, windowId: string) => void

  // ── Actions: internal UI state per tab ─────────────────────────────
  setTabUiState: (
    windowId: string,
    tabId: string,
    key: string,
    value: unknown
  ) => void
  getTabUiState: (windowId: string, tabId: string, key: string) => unknown

  // ── Actions: splitter ──────────────────────────────────────────────
  setSplitterSize: (windowId: string, size: number) => void

  // ── Actions: maintenance ───────────────────────────────────────────
  gcStaleWindows: () => void
}

// ─── Tab factory helpers ──────────────────────────────────────────────

export function createTab(
  type: TabType,
  id?: string,
  name?: string,
  internalUiState: Record<string, unknown> = {}
): Tab {
  let tabId = type as string
  const params: Record<string, string> = {}

  if (id) {
    switch (type) {
      case 'modelViewer':
        tabId = `model-${id}`
        params.modelId = id
        break
      case 'textureSetViewer':
        tabId = `set-${id}`
        params.setId = id
        break
      case 'packViewer':
        tabId = `pack-${id}`
        params.packId = id
        break
      case 'projectViewer':
        tabId = `project-${id}`
        params.projectId = id
        break
      case 'stageEditor':
        tabId = `stage-${id}`
        params.stageId = id
        break
    }
  }

  return {
    id: tabId,
    type,
    label:
      name ||
      getTabLabel(type, {
        modelId: type === 'modelViewer' ? id : undefined,
        setId: type === 'textureSetViewer' ? id : undefined,
        packId: type === 'packViewer' ? id : undefined,
        projectId: type === 'projectViewer' ? id : undefined,
        stageId: type === 'stageEditor' ? id : undefined,
        modelName: type === 'modelViewer' && name ? name : undefined,
        setName: type === 'textureSetViewer' && name ? name : undefined,
        packName: type === 'packViewer' && name ? name : undefined,
        projectName: type === 'projectViewer' && name ? name : undefined,
        stageName: type === 'stageEditor' && name ? name : undefined,
      }),
    params,
    internalUiState,
    // Legacy accessors
    modelId: params.modelId,
    setId: params.setId,
    packId: params.packId,
    projectId: params.projectId,
    stageId: params.stageId,
  }
}

// ─── Default window state ─────────────────────────────────────────────

function createDefaultWindowState(): WindowState {
  return {
    tabs: [createTab('modelList')],
    activeTabId: 'modelList',
    splitterSize: 50,
    lastActiveAt: new Date().toISOString(),
  }
}

// ─── Zustand store ────────────────────────────────────────────────────

export const useNavigationStore = create<NavigationStore>()(
  persist(
    (set, get) => ({
      activeWindows: {},
      recentlyClosedTabs: [],
      recentlyClosedWindows: [],

      // ── Window lifecycle ────────────────────────────────────────────

      initWindow: (windowId: string) => {
        set(state => {
          if (state.activeWindows[windowId]) {
            // Window already exists — just touch it
            return {
              activeWindows: {
                ...state.activeWindows,
                [windowId]: {
                  ...state.activeWindows[windowId],
                  lastActiveAt: new Date().toISOString(),
                },
              },
            }
          }
          // Brand-new window
          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: createDefaultWindowState(),
            },
          }
        })
      },

      removeWindow: (windowId: string) => {
        set(state => {
          const windowState = state.activeWindows[windowId]
          if (!windowState) return state

          const { [windowId]: _, ...rest } = state.activeWindows
          return {
            activeWindows: rest,
            recentlyClosedWindows: [
              { closedAt: new Date().toISOString(), state: windowState },
              ...state.recentlyClosedWindows,
            ].slice(0, MAX_RECENTLY_CLOSED_WINDOWS),
          }
        })
      },

      touchWindow: (windowId: string) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state
          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: { ...ws, lastActiveAt: new Date().toISOString() },
            },
          }
        })
      },

      // ── Tab management ──────────────────────────────────────────────

      openTab: (windowId, _side, tab) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state

          // Dedup: if tab already exists, just activate it
          const existing = ws.tabs.find(t => t.id === tab.id)
          if (existing) {
            return {
              activeWindows: {
                ...state.activeWindows,
                [windowId]: {
                  ...ws,
                  activeTabId: tab.id,
                  lastActiveAt: new Date().toISOString(),
                },
              },
            }
          }

          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: {
                ...ws,
                tabs: [...ws.tabs, tab],
                activeTabId: tab.id,
                lastActiveAt: new Date().toISOString(),
              },
            },
          }
        })
      },

      closeTab: (windowId, tabId) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state

          const closedTab = ws.tabs.find(t => t.id === tabId)
          const closedIndex = ws.tabs.findIndex(t => t.id === tabId)
          const newTabs = ws.tabs.filter(t => t.id !== tabId)

          let newActiveTabId = ws.activeTabId
          if (ws.activeTabId === tabId) {
            if (newTabs.length > 0) {
              const newIndex = Math.min(
                closedIndex > 0 ? closedIndex - 1 : 0,
                newTabs.length - 1
              )
              newActiveTabId = newTabs[newIndex].id
            } else {
              newActiveTabId = null
            }
          }

          const newRecentlyClosedTabs = closedTab
            ? [
                closedTab,
                ...state.recentlyClosedTabs.filter(t => t.id !== tabId),
              ].slice(0, MAX_RECENTLY_CLOSED_TABS)
            : state.recentlyClosedTabs

          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: {
                ...ws,
                tabs: newTabs,
                activeTabId: newActiveTabId,
                lastActiveAt: new Date().toISOString(),
              },
            },
            recentlyClosedTabs: newRecentlyClosedTabs,
          }
        })
      },

      setActiveTab: (windowId, activeTabId) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state
          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: {
                ...ws,
                activeTabId,
                lastActiveAt: new Date().toISOString(),
              },
            },
          }
        })
      },

      setTabs: (windowId, tabs) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state
          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: {
                ...ws,
                tabs,
                lastActiveAt: new Date().toISOString(),
              },
            },
          }
        })
      },

      moveTabBetweenPanels: (windowId, _tab, _fromSide) => {
        // In the new architecture, left/right panels share a single tab array.
        // This action is a no-op here; cross-panel dragging is handled at the
        // component level by reordering within the same tabs array.
        // Kept for API compatibility.
        get().touchWindow(windowId)
      },

      // ── Cross-window transfer ───────────────────────────────────────

      removeTabFromWindow: (windowId, tabId) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state

          const removedIndex = ws.tabs.findIndex(t => t.id === tabId)
          const newTabs = ws.tabs.filter(t => t.id !== tabId)
          let newActiveTabId = ws.activeTabId
          if (ws.activeTabId === tabId) {
            if (newTabs.length > 0) {
              const newIndex = Math.min(
                removedIndex > 0 ? removedIndex - 1 : 0,
                newTabs.length - 1
              )
              newActiveTabId = newTabs[newIndex].id
            } else {
              newActiveTabId = null
            }
          }

          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: { ...ws, tabs: newTabs, activeTabId: newActiveTabId },
            },
          }
        })
      },

      addTabToWindow: (windowId, tab) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state

          if (ws.tabs.some(t => t.id === tab.id)) {
            return {
              activeWindows: {
                ...state.activeWindows,
                [windowId]: { ...ws, activeTabId: tab.id },
              },
            }
          }

          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: {
                ...ws,
                tabs: [...ws.tabs, tab],
                activeTabId: tab.id,
              },
            },
          }
        })
      },

      // ── Recently closed ─────────────────────────────────────────────

      addRecentlyClosedTab: tab => {
        set(state => ({
          recentlyClosedTabs: [
            tab,
            ...state.recentlyClosedTabs.filter(t => t.id !== tab.id),
          ].slice(0, MAX_RECENTLY_CLOSED_TABS),
        }))
      },

      removeRecentlyClosedTab: tabId => {
        set(state => ({
          recentlyClosedTabs: state.recentlyClosedTabs.filter(
            t => t.id !== tabId
          ),
        }))
      },

      restoreWindow: (index, windowId) => {
        set(state => {
          const entry = state.recentlyClosedWindows[index]
          if (!entry) return state

          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: {
                ...entry.state,
                lastActiveAt: new Date().toISOString(),
              },
            },
            recentlyClosedWindows: state.recentlyClosedWindows.filter(
              (_, i) => i !== index
            ),
          }
        })
      },

      // ── Tab internal UI state ───────────────────────────────────────

      setTabUiState: (windowId, tabId, key, value) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state

          const newTabs = ws.tabs.map(t =>
            t.id === tabId
              ? {
                  ...t,
                  internalUiState: { ...t.internalUiState, [key]: value },
                }
              : t
          )

          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: { ...ws, tabs: newTabs },
            },
          }
        })
      },

      getTabUiState: (windowId, tabId, key) => {
        const ws = get().activeWindows[windowId]
        if (!ws) return undefined
        const tab = ws.tabs.find(t => t.id === tabId)
        return tab?.internalUiState?.[key]
      },

      // ── Splitter ────────────────────────────────────────────────────

      setSplitterSize: (windowId, size) => {
        set(state => {
          const ws = state.activeWindows[windowId]
          if (!ws) return state
          return {
            activeWindows: {
              ...state.activeWindows,
              [windowId]: { ...ws, splitterSize: size },
            },
          }
        })
      },

      // ── Garbage collection ──────────────────────────────────────────

      gcStaleWindows: () => {
        set(state => {
          const now = Date.now()
          const stale: string[] = []
          const movedToRecent: ClosedWindowEntry[] = []

          for (const [id, ws] of Object.entries(state.activeWindows)) {
            const age = now - new Date(ws.lastActiveAt).getTime()
            if (age > STALE_WINDOW_MS) {
              stale.push(id)
              movedToRecent.push({
                closedAt: new Date().toISOString(),
                state: ws,
              })
            }
          }

          if (stale.length === 0) return state

          const activeWindows = { ...state.activeWindows }
          for (const id of stale) {
            delete activeWindows[id]
          }

          return {
            activeWindows,
            recentlyClosedWindows: [
              ...movedToRecent,
              ...state.recentlyClosedWindows,
            ].slice(0, MAX_RECENTLY_CLOSED_WINDOWS),
          }
        })
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist what's needed; exclude transient function references
      partialize: state => ({
        activeWindows: state.activeWindows,
        recentlyClosedTabs: state.recentlyClosedTabs,
        recentlyClosedWindows: state.recentlyClosedWindows,
      }),
    }
  )
)

// ─── Window ID management ─────────────────────────────────────────────

export function getWindowId(): string {
  let id = sessionStorage.getItem(SESSION_WINDOW_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_WINDOW_ID_KEY, id)
  }
  return id
}

// ─── BroadcastChannel singleton ───────────────────────────────────────

let _channel: BroadcastChannel | null = null

export function getNavigationChannel(): BroadcastChannel {
  if (!_channel) {
    _channel = new BroadcastChannel(BROADCAST_CHANNEL)
  }
  return _channel
}

export function broadcastNavigation(msg: NavigationBroadcast): void {
  try {
    getNavigationChannel().postMessage(msg)
  } catch {
    // BroadcastChannel may not be supported; silently degrade
  }
}
