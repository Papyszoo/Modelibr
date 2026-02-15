import { useEffect, useRef } from 'react'
import { useNavigationStore, createTab } from '@/stores/navigationStore'
import { TabType } from '@/types'

/**
 * Deep link route patterns.
 * Matches paths like `/view/model/123`, `/view/pack/456`, etc.
 */
const DEEP_LINK_PATTERNS: Array<{
  pattern: RegExp
  tabType: TabType
  idGroup: number
}> = [
  { pattern: /^\/view\/model\/(.+)$/, tabType: 'modelViewer', idGroup: 1 },
  {
    pattern: /^\/view\/texture-set\/(.+)$/,
    tabType: 'textureSetViewer',
    idGroup: 1,
  },
  { pattern: /^\/view\/pack\/(.+)$/, tabType: 'packViewer', idGroup: 1 },
  { pattern: /^\/view\/project\/(.+)$/, tabType: 'projectViewer', idGroup: 1 },
  { pattern: /^\/view\/stage\/(.+)$/, tabType: 'stageEditor', idGroup: 1 },
]

/**
 * On app start, check if the URL contains a deep link (e.g. `/view/model/123`).
 * If so, add that resource as a new tab in the current window and clear the
 * URL to maintain a clean "app-like" appearance.
 */
export function useDeepLinkHandler(windowId: string): void {
  const hasRun = useRef(false)
  const openTab = useNavigationStore(s => s.openTab)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const path = window.location.pathname

    for (const { pattern, tabType, idGroup } of DEEP_LINK_PATTERNS) {
      const match = path.match(pattern)
      if (match) {
        const id = match[idGroup]
        const tab = createTab(tabType, id)
        openTab(windowId, 'left', tab)

        // Clean the URL
        window.history.replaceState({}, '', '/')
        break
      }
    }

    // Also clean any leftover query params from the old URL-based system
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [windowId, openTab])
}
