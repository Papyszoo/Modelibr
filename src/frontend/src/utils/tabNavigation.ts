import { Tab, TabType } from '@/types'
import {
  useNavigationStore,
  getWindowId,
  createTab,
} from '@/stores/navigationStore'

/**
 * Open a tab in the navigation store for the current window.
 *
 * This replaces the old URL-based openTabInPanel. The `panel` parameter
 * is kept for API compatibility but is no longer used to write URL params.
 */
export function openTabInPanel(
  tabType: TabType,
  _panel: 'left' | 'right' = 'left',
  id?: string,
  name?: string
): void {
  const windowId = getWindowId()
  const tab = createTab(tabType, id, name)
  useNavigationStore.getState().openTab(windowId, 'left', tab)
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
