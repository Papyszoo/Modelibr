import {
  createTab,
  getWindowId,
  useNavigationStore,
} from '@/stores/navigationStore'
import { type Tab, type TabType } from '@/types'

/**
 * Open a tab in the navigation store for the current window.
 */
export function openTabInPanel(
  tabType: TabType,
  panel: 'left' | 'right' = 'left',
  id?: string,
  name?: string
): void {
  const windowId = getWindowId()
  const tab = createTab(tabType, id, name)
  useNavigationStore.getState().openTab(windowId, panel, tab)
}

/**
 * Close a tab from the current window.
 */
export function closeTabInPanel(tabId: string): void {
  const windowId = getWindowId()
  useNavigationStore.getState().closeTab(windowId, tabId)
}

/**
 * Switch the active tab in the current window.
 */
export function switchTab(tabId: string): void {
  const windowId = getWindowId()
  useNavigationStore.getState().setActiveTab(windowId, tabId)
}

/**
 * Get all tabs for the current window.
 */
export function getCurrentWindowTabs(): Tab[] {
  const windowId = getWindowId()
  const ws = useNavigationStore.getState().activeWindows[windowId]
  return ws?.tabs ?? []
}

/**
 * Get the active tab ID for the current window.
 */
export function getCurrentActiveTab(): string | null {
  const windowId = getWindowId()
  const ws = useNavigationStore.getState().activeWindows[windowId]
  return ws?.activeTabId ?? null
}
