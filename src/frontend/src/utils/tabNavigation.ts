import { serializeToCompactFormat, parseCompactTabFormat } from './tabSerialization'
import { Tab } from '../types'

/**
 * Generic utility to open a tab using URL manipulation
 * This is the default way to handle tab navigation across the app
 */
export function openTabInPanel(
  tabType: Tab['type'],
  panel: 'left' | 'right' = 'left',
  id?: string
): void {
  const url = new URL(window.location.href)
  const tabsParam = panel === 'left' ? 'leftTabs' : 'rightTabs'
  const activeParam = panel === 'left' ? 'activeLeft' : 'activeRight'

  // Get current tabs
  const currentTabsStr = url.searchParams.get(tabsParam) || ''
  const currentTabs = parseCompactTabFormat(currentTabsStr, [])

  // Create new tab spec
  let newTabSpec = tabType
  let newTabId = tabType

  if (id) {
    newTabSpec = `${tabType}:${id}`
    if (tabType === 'modelViewer') {
      newTabId = `model-${id}`
    } else if (tabType === 'textureSetViewer') {
      newTabId = `set-${id}`
    } else if (tabType === 'packViewer') {
      newTabId = `pack-${id}`
    }
  }

  // Check if tab already exists
  const tabExists = currentTabs.some(tab => tab.id === newTabId)

  if (!tabExists) {
    // Add the new tab
    const newTab: Tab = id
      ? {
          id: newTabId,
          type: tabType,
          ...(tabType === 'modelViewer' && { modelId: id }),
          ...(tabType === 'textureSetViewer' && { setId: id }),
          ...(tabType === 'packViewer' && { packId: id }),
        }
      : { id: tabType, type: tabType }

    const newTabs = [...currentTabs, newTab]
    url.searchParams.set(tabsParam, serializeToCompactFormat(newTabs))
  }

  // Set as active tab
  url.searchParams.set(activeParam, newTabId)

  // Navigate to the new URL
  window.history.pushState({}, '', url.toString())
  // Trigger a popstate event to update the UI
  window.dispatchEvent(new PopStateEvent('popstate'))
}
