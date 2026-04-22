import './MobileShell.css'

import { useCallback, useState } from 'react'

import { DockProvider } from '@/contexts/DockContext'
import { useDeepLinkHandler } from '@/hooks/useDeepLinkHandler'
import { useWindowInit } from '@/hooks/useWindowInit'
import { createTab, useNavigationStore } from '@/stores/navigationStore'
import { useUIPreferencesStore } from '@/stores/uiPreferencesStore'
import { type Tab } from '@/types'

import { type DockPlacement } from './dock-panel/DockBar'
import { DockPanelContent } from './DockPanelContent'

/**
 * Mobile-friendly shell: collapses the desktop two-panel splitter into a
 * single dock with all tabs merged. Bar position is user-configurable via
 * `uiPreferencesStore.mobileBarPosition`.
 *
 * Tab routing convention is preserved: tabs flagged with `params.panel === 'right'`
 * remain flagged so the desktop view can re-split them on resize.
 */
export function MobileShell() {
  const windowId = useWindowInit()
  useDeepLinkHandler(windowId)

  const windowState = useNavigationStore(s => s.activeWindows[windowId])
  const setTabsAction = useNavigationStore(s => s.setTabs)
  const setActiveTabAction = useNavigationStore(s => s.setActiveTab)
  const setActiveRightTabAction = useNavigationStore(s => s.setActiveRightTab)

  const mobileBarPosition = useUIPreferencesStore(s => s.mobileBarPosition)

  const tabs = windowState?.tabs ?? [createTab('modelList')]
  const activeTabId = windowState?.activeTabId ?? tabs[0]?.id ?? ''
  const activeRightTabId = windowState?.activeRightTabId ?? null

  // Pick whichever side's "active" id still points at a real tab so that a
  // user dropping back to desktop sees something selected on both panels.
  const resolvedActive =
    tabs.find(t => t.id === activeTabId)?.id ??
    tabs.find(t => t.id === activeRightTabId)?.id ??
    tabs[0]?.id ??
    ''

  // Local drag state — cross-panel moves don't apply on mobile (one panel),
  // but DockPanelContent expects these props.
  const [draggedTab, setDraggedTab] = useState<Tab | null>(null)

  const setTabs = useCallback(
    (newTabs: Tab[]) => {
      setTabsAction(windowId, newTabs)
    },
    [windowId, setTabsAction]
  )

  const setActiveTab = useCallback(
    (tabId: string) => {
      // Mirror to both side-active fields so resize-back to desktop keeps state.
      setActiveTabAction(windowId, tabId)
      setActiveRightTabAction(windowId, tabId)
    },
    [windowId, setActiveTabAction, setActiveRightTabAction]
  )

  // No-op: there is only one panel on mobile.
  const moveTabBetweenPanels = useCallback(() => {}, [])

  const placement: DockPlacement = mobileBarPosition

  return (
    <DockProvider>
      <div className="mobile-shell">
        <DockPanelContent
          side="left"
          placement={placement}
          tabs={tabs}
          setTabs={setTabs}
          activeTab={resolvedActive}
          setActiveTab={setActiveTab}
          draggedTab={draggedTab}
          setDraggedTab={setDraggedTab}
          moveTabBetweenPanels={moveTabBetweenPanels}
        />
      </div>
    </DockProvider>
  )
}
