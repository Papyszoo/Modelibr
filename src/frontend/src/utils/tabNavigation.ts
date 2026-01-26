import {
  serializeToCompactFormat,
  parseCompactTabFormat,
  getTabLabel,
} from './tabSerialization'
import { Tab } from '../types'

/**
 * Generic utility to open a tab using URL manipulation
 * This is the unified way to handle tab navigation across the app
 */
export function openTabInPanel(
  tabType: Tab['type'],
  panel: 'left' | 'right' = 'left',
  id?: string,
  name?: string
): void {
  const url = new URL(window.location.href)
  const tabsParam = panel === 'left' ? 'leftTabs' : 'rightTabs'
  const activeParam = panel === 'left' ? 'activeLeft' : 'activeRight'

  // Get current tabs
  const currentTabsStr = url.searchParams.get(tabsParam) || ''
  const currentTabs = parseCompactTabFormat(currentTabsStr, [])

  // Create new tab ID
  let newTabId = tabType

  if (id) {
    if (tabType === 'modelViewer') {
      newTabId = `model-${id}`
    } else if (tabType === 'textureSetViewer') {
      newTabId = `set-${id}`
    } else if (tabType === 'packViewer') {
      newTabId = `pack-${id}`
    } else if (tabType === 'projectViewer') {
      newTabId = `project-${id}`
    } else if (tabType === 'stageEditor') {
      newTabId = `stage-${id}`
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
          label: name || getTabLabel(tabType, { 
            modelId: tabType === 'modelViewer' ? id : undefined,
            setId: tabType === 'textureSetViewer' ? id : undefined,
            packId: tabType === 'packViewer' ? id : undefined,
            projectId: tabType === 'projectViewer' ? id : undefined,
            stageId: tabType === 'stageEditor' ? id : undefined,
            modelName: tabType === 'modelViewer' && name ? name : undefined,
            setName: tabType === 'textureSetViewer' && name ? name : undefined,
            packName: tabType === 'packViewer' && name ? name : undefined,
            projectName: tabType === 'projectViewer' && name ? name : undefined,
            stageName: tabType === 'stageEditor' && name ? name : undefined,
          }),
          ...(tabType === 'modelViewer' && { modelId: id }),
          ...(tabType === 'textureSetViewer' && { setId: id }),
          ...(tabType === 'packViewer' && { packId: id }),
          ...(tabType === 'projectViewer' && { projectId: id }),
          ...(tabType === 'stageEditor' && { stageId: id }),
        }
      : { 
          id: tabType, 
          type: tabType,
          label: name || getTabLabel(tabType),
        }

    const newTabs = [...currentTabs, newTab]
    url.searchParams.set(tabsParam, serializeToCompactFormat(newTabs))
  }

  // Set as active tab
  url.searchParams.set(activeParam, newTabId)

  // Build URL manually to avoid encoding issues
  const params = new URLSearchParams(url.search)
  const newUrl = `${url.origin}${url.pathname}?${params.toString()}`

  // Navigate to the new URL
  window.history.pushState({}, '', newUrl)
  // Trigger a popstate event to update the UI
  window.dispatchEvent(new PopStateEvent('popstate'))
}
