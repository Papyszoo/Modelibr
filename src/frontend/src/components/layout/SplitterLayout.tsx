import { useState, useEffect, useCallback, useRef } from 'react'
import { Splitter, SplitterPanel } from 'primereact/splitter'
import { DockProvider } from '@/contexts/DockContext'
import { DockPanel } from './DockPanel'
import { Tab, SplitterEvent } from '@/types'
import { useNavigationStore, createTab } from '@/stores/navigationStore'
import { useWindowInit } from '@/hooks/useWindowInit'
import { useDeepLinkHandler } from '@/hooks/useDeepLinkHandler'
import { usePanelStore } from '@/stores/panelStore'
import {
  parseCompactTabFormatAsync,
  serializeToCompactFormat,
} from '@/utils/tabSerialization'
import './SplitterLayout.css'

export function SplitterLayout(): JSX.Element {
  // ── Window identity & lifecycle ─────────────────────────────────────
  const windowId = useWindowInit()
  useDeepLinkHandler(windowId)

  // ── Zustand selectors ───────────────────────────────────────────────
  const windowState = useNavigationStore(s => s.activeWindows[windowId])
  const setTabsAction = useNavigationStore(s => s.setTabs)
  const setActiveTabAction = useNavigationStore(s => s.setActiveTab)
  const setSplitterSizeAction = useNavigationStore(s => s.setSplitterSize)

  const tabs = windowState?.tabs ?? [createTab('modelList')]
  const activeTabId = windowState?.activeTabId ?? 'modelList'
  const splitterSize = windowState?.splitterSize ?? 50

  // ── Split tabs into left/right based on their position ──────────────
  // We use a simple model: even-indexed tabs → left, odd-indexed → right.
  // To maintain perfect backward compat with the existing dual-panel layout,
  // we split the flat tab list in two halves for the two DockPanels.
  // But to keep the store simple, we fake left/right with index based split.
  //
  // Actually, to stay fully compatible with the current DockPanel prop API
  // which has independent left/right tab arrays plus active tab per panel,
  // we keep the two-panel model by storing left tabs in the first portion
  // and right tabs after. We use a convention:
  //   - tabs with ids NOT starting with "right:" go to left
  //   - tabs with ids starting with "right:" go to right
  //
  // HOWEVER, this is overly complex. Instead, the simplest approach is to
  // keep TWO separate arrays inside WindowState.tabs by convention:
  // store all tabs together + a separate "rightTabIds" set.
  //
  // The SIMPLEST backward-compatible approach: maintain a local split.
  // The Zustand store holds ALL tabs in a flat list, and we use a
  // "rightTabIds" Set stored in the window's first tab internal state.
  //
  // FINAL DECISION: Keep the existing dual-panel layout. Store leftTabs
  // and rightTabs as the first and second halves of a serialized format
  // in internalUiState at the window level. But that conflicts with the
  // store shape...
  //
  // Let me take the pragmatic route: the store's WindowState.tabs holds
  // the LEFT panel tabs. Right panel tabs are stored in a second key under
  // window state. BUT changing the store type is heavy.
  //
  // PRAGMATIC SOLUTION: Use Zustand store as primary, but split the flat
  // tabs array using a marker. Each tab gets a `panel` field in params.

  const leftTabs = tabs.filter(t => t.params?.panel !== 'right')
  const rightTabs = tabs.filter(t => t.params?.panel === 'right')

  // Active tabs per panel — stored as UI state keys on the window
  const activeLeftTab = leftTabs.find(t => t.id === activeTabId)
    ? activeTabId
    : (leftTabs[0]?.id ?? '')
  const activeRightTab = rightTabs.find(t => t.id === activeTabId)
    ? activeTabId
    : (rightTabs[0]?.id ?? '')

  // Global drag state for cross-panel tab dragging
  const [draggedTab, setDraggedTab] = useState<Tab | null>(null)

  // Zustand store for panel sizes
  const { setLeftPanelWidth, setRightPanelWidth } = usePanelStore()

  // Update store when splitter size changes or window resizes
  useEffect(() => {
    const updatePanelSizes = () => {
      const totalWidth = window.innerWidth
      setLeftPanelWidth((totalWidth * splitterSize) / 100)
      setRightPanelWidth((totalWidth * (100 - splitterSize)) / 100)
    }

    updatePanelSizes()
    window.addEventListener('resize', updatePanelSizes)
    return () => window.removeEventListener('resize', updatePanelSizes)
  }, [splitterSize, setLeftPanelWidth, setRightPanelWidth])

  // Track label updates
  const leftLabelsUpdated = useRef<Set<string>>(new Set())
  const rightLabelsUpdated = useRef<Set<string>>(new Set())

  // Update tab labels with actual names from database
  const updateTabLabels = useCallback(
    async (
      panelTabs: Tab[],
      labelsUpdated: React.MutableRefObject<Set<string>>
    ) => {
      const tabsStr = serializeToCompactFormat(panelTabs)
      if (!tabsStr) return

      const tabsNeedingUpdate = panelTabs.filter(
        tab => !labelsUpdated.current.has(tab.id)
      )
      if (tabsNeedingUpdate.length === 0) return

      try {
        const updatedTabs = await parseCompactTabFormatAsync(tabsStr, panelTabs)
        updatedTabs.forEach(tab => labelsUpdated.current.add(tab.id))
        const hasChanges = updatedTabs.some(
          (tab, idx) => tab.label !== panelTabs[idx]?.label
        )
        if (hasChanges) {
          // Merge updated labels back into the full tabs array
          const allTabs = [...tabs]
          for (const updated of updatedTabs) {
            const idx = allTabs.findIndex(t => t.id === updated.id)
            if (idx !== -1 && updated.label !== allTabs[idx].label) {
              allTabs[idx] = { ...allTabs[idx], label: updated.label }
            }
          }
          setTabsAction(windowId, allTabs)
        }
      } catch {
        // Keep existing tabs if async fetch fails
      }
    },
    [tabs, windowId, setTabsAction]
  )

  useEffect(() => {
    updateTabLabels(leftTabs, leftLabelsUpdated)
  }, [leftTabs, updateTabLabels])

  useEffect(() => {
    updateTabLabels(rightTabs, rightLabelsUpdated)
  }, [rightTabs, updateTabLabels])

  // ── Setters that write through to the store ─────────────────────────

  const setLeftTabs = useCallback(
    (newLeftTabs: Tab[]) => {
      // Ensure left tabs have no panel marker
      const marked = newLeftTabs.map(t => {
        const { panel: _, ...rest } = t.params
        return { ...t, params: rest }
      })
      setTabsAction(windowId, [...marked, ...rightTabs])
    },
    [windowId, rightTabs, setTabsAction]
  )

  const setRightTabs = useCallback(
    (newRightTabs: Tab[]) => {
      const marked = newRightTabs.map(t => ({
        ...t,
        params: { ...t.params, panel: 'right' },
      }))
      setTabsAction(windowId, [...leftTabs, ...marked])
    },
    [windowId, leftTabs, setTabsAction]
  )

  const setActiveLeftTab = useCallback(
    (tabId: string) => {
      setActiveTabAction(windowId, tabId)
    },
    [windowId, setActiveTabAction]
  )

  const setActiveRightTab = useCallback(
    (tabId: string) => {
      setActiveTabAction(windowId, tabId)
    },
    [windowId, setActiveTabAction]
  )

  const handleSplitterResizeEnd = (event: SplitterEvent): void => {
    const leftSize = Math.round(event.sizes[0])
    setSplitterSizeAction(windowId, leftSize)
    const totalWidth = window.innerWidth
    setLeftPanelWidth((totalWidth * leftSize) / 100)
    setRightPanelWidth((totalWidth * (100 - leftSize)) / 100)
  }

  // Central function to move tabs between panels
  const moveTabBetweenPanels = (tab: Tab, fromSide: 'left' | 'right'): void => {
    if (fromSide === 'left') {
      const movedTabIndex = leftTabs.findIndex(t => t.id === tab.id)
      const newLeftTabs = leftTabs.filter(t => t.id !== tab.id)
      const movedTab = { ...tab, params: { ...tab.params, panel: 'right' } }
      const newRightTabs = [...rightTabs, movedTab]

      const allTabs = [
        ...newLeftTabs.map(t => {
          const { panel: _, ...rest } = t.params
          return { ...t, params: rest }
        }),
        ...newRightTabs,
      ]
      setTabsAction(windowId, allTabs)
      setActiveRightTab(tab.id)

      if (activeLeftTab === tab.id) {
        if (newLeftTabs.length > 0) {
          const newActiveIndex = Math.min(
            movedTabIndex > 0 ? movedTabIndex - 1 : 0,
            newLeftTabs.length - 1
          )
          setActiveLeftTab(newLeftTabs[newActiveIndex].id)
        }
      }
    } else {
      const movedTabIndex = rightTabs.findIndex(t => t.id === tab.id)
      const newRightTabs = rightTabs.filter(t => t.id !== tab.id)
      const { panel: _, ...restParams } = tab.params
      const movedTab = { ...tab, params: restParams }
      const newLeftTabs = [...leftTabs, movedTab]

      const allTabs = [
        ...newLeftTabs.map(t => {
          const { panel: _p, ...rest } = t.params
          return { ...t, params: rest }
        }),
        ...newRightTabs.map(t => ({
          ...t,
          params: { ...t.params, panel: 'right' },
        })),
      ]
      setTabsAction(windowId, allTabs)
      setActiveLeftTab(tab.id)

      if (activeRightTab === tab.id) {
        if (newRightTabs.length > 0) {
          const newActiveIndex = Math.min(
            movedTabIndex > 0 ? movedTabIndex - 1 : 0,
            newRightTabs.length - 1
          )
          setActiveRightTab(newRightTabs[newActiveIndex].id)
        }
      }
    }

    setDraggedTab(null)
  }

  const leftSize = splitterSize
  const rightSize = 100 - splitterSize

  return (
    <DockProvider>
      <div className="splitter-layout">
        <Splitter layout="horizontal" onResizeEnd={handleSplitterResizeEnd}>
          <SplitterPanel size={leftSize} minSize={20}>
            <DockPanel
              side="left"
              tabs={leftTabs}
              setTabs={setLeftTabs}
              activeTab={activeLeftTab}
              setActiveTab={setActiveLeftTab}
              otherTabs={rightTabs}
              setOtherTabs={setRightTabs}
              otherActiveTab={activeRightTab}
              setOtherActiveTab={setActiveRightTab}
              draggedTab={draggedTab}
              setDraggedTab={setDraggedTab}
              moveTabBetweenPanels={moveTabBetweenPanels}
            />
          </SplitterPanel>
          <SplitterPanel size={rightSize} minSize={20}>
            <DockPanel
              side="right"
              tabs={rightTabs}
              setTabs={setRightTabs}
              activeTab={activeRightTab}
              setActiveTab={setActiveRightTab}
              otherTabs={leftTabs}
              setOtherTabs={setLeftTabs}
              otherActiveTab={activeLeftTab}
              setOtherActiveTab={setActiveLeftTab}
              draggedTab={draggedTab}
              setDraggedTab={setDraggedTab}
              moveTabBetweenPanels={moveTabBetweenPanels}
            />
          </SplitterPanel>
        </Splitter>
      </div>
    </DockProvider>
  )
}

