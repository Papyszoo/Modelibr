import { useCallback } from 'react'
import { useNavigationStore, getWindowId } from '@/stores/navigationStore'

/**
 * Hook to read/write a tab's internal UI state from the Zustand navigation
 * store. This allows component-level UI state (e.g. active sub-tab, scroll
 * position) to persist across page refreshes (F5).
 *
 * @param tabId  The id of the tab owning this state
 * @param key    A unique key within that tab's UI state
 * @param defaultValue  Fallback when the key is not yet set
 */
export function useTabUiState<T>(
  tabId: string,
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const windowId = getWindowId()

  const value = useNavigationStore(s => {
    const ws = s.activeWindows[windowId]
    if (!ws) return defaultValue
    const tab = ws.tabs.find(t => t.id === tabId)
    const stored = tab?.internalUiState?.[key]
    return (stored as T) ?? defaultValue
  })

  const setTabUiState = useNavigationStore(s => s.setTabUiState)

  const setValue = useCallback(
    (newValue: T) => {
      setTabUiState(windowId, tabId, key, newValue)
    },
    [windowId, tabId, key, setTabUiState]
  )

  return [value, setValue]
}
