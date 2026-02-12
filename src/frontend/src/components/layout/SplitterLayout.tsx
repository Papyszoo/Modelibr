import { useState, useEffect, useCallback, useRef } from 'react'
import { Splitter, SplitterPanel } from 'primereact/splitter'
import { useQueryState } from 'nuqs'
import { DockProvider } from '../../contexts/DockContext'
import DockPanel from './DockPanel'
import { Tab, SplitterEvent } from '../../types'
import {
  parseCompactTabFormat,
  parseCompactTabFormatAsync,
  serializeToCompactFormat,
} from '../../utils/tabSerialization'
import { usePanelStore } from '../../stores/panelStore'
import './SplitterLayout.css'

function SplitterLayout(): JSX.Element {
  // Global drag state for cross-panel tab dragging
  const [draggedTab, setDraggedTab] = useState<Tab | null>(null)

  // Zustand store for panel sizes
  const { setLeftPanelWidth, setRightPanelWidth } = usePanelStore()

  // URL state for splitter size (percentage for left panel)
  const [splitterSize, setSplitterSize] = useQueryState('split', {
    defaultValue: '50',
    parse: value => value || '50',
    serialize: value => value,
  })

  // Update store when splitter size changes or window resizes
  useEffect(() => {
    const updatePanelSizes = () => {
      const leftPercentage = parseFloat(splitterSize)
      const totalWidth = window.innerWidth
      setLeftPanelWidth((totalWidth * leftPercentage) / 100)
      setRightPanelWidth((totalWidth * (100 - leftPercentage)) / 100)
    }

    updatePanelSizes()
    window.addEventListener('resize', updatePanelSizes)

    return () => {
      window.removeEventListener('resize', updatePanelSizes)
    }
  }, [splitterSize, setLeftPanelWidth, setRightPanelWidth])

  // URL state for left panel tabs
  const [leftTabs, setLeftTabs] = useQueryState('leftTabs', {
    defaultValue: [{ id: 'modelList', type: 'modelList' }] as Tab[],
    parse: (value): Tab[] =>
      parseCompactTabFormat(value, [{ id: 'modelList', type: 'modelList' }]),
    serialize: serializeToCompactFormat,
    clearOnDefault: false,
  })

  // URL state for right panel tabs
  const [rightTabs, setRightTabs] = useQueryState('rightTabs', {
    defaultValue: [] as Tab[],
    parse: (value): Tab[] => parseCompactTabFormat(value, []),
    serialize: serializeToCompactFormat,
  })

  // URL state for active tabs
  const [activeLeftTab, setActiveLeftTab] = useQueryState('activeLeft', {
    defaultValue: 'modelList',
    parse: value => value || 'modelList',
    serialize: value => value,
    clearOnDefault: false,
  })

  const [activeRightTab, setActiveRightTab] = useQueryState('activeRight', {
    defaultValue: '',
    parse: value => value || '',
    serialize: value => value,
  })

  // Deduplicate tabs on initial load if URL contains duplicates
  // This runs once on mount to clean up any duplicate tabs from the URL
  const hasCleanedDuplicates = useRef(false)
  useEffect(() => {
    if (hasCleanedDuplicates.current) return
    hasCleanedDuplicates.current = true

    // Get raw URL values to check for duplicates
    const urlParams = new URLSearchParams(window.location.search)
    const rawLeftTabs = urlParams.get('leftTabs') || ''
    const rawRightTabs = urlParams.get('rightTabs') || ''

    // Check if raw URL has duplicate tab IDs (before deduplication)
    const leftUrlIds = rawLeftTabs.split(',').filter(id => id)
    const leftUniqueUrlIds = [...new Set(leftUrlIds)]

    if (leftUrlIds.length !== leftUniqueUrlIds.length) {
      // Force update with already-deduplicated tabs to sync URL
      // The tabs are already deduplicated by parseCompactTabFormat,
      // but we need to explicitly set them to trigger URL update
      setLeftTabs([...leftTabs])
    }

    // Check if rightTabs raw URL has duplicates
    const rightUrlIds = rawRightTabs.split(',').filter(id => id)
    const rightUniqueUrlIds = [...new Set(rightUrlIds)]

    if (rightUrlIds.length !== rightUniqueUrlIds.length) {
      setRightTabs([...rightTabs])
    }
  }, [leftTabs, rightTabs, setLeftTabs, setRightTabs])

  // Track URL parameter values for label updates
  const leftTabsUrl = useRef<string>('')
  const rightTabsUrl = useRef<string>('')
  const leftLabelsUpdated = useRef<Set<string>>(new Set())
  const rightLabelsUpdated = useRef<Set<string>>(new Set())

  // Update tab labels with actual names from database
  const updateTabLabels = useCallback(
    async (
      tabs: Tab[],
      setTabs: (tabs: Tab[]) => void,
      labelsUpdated: React.MutableRefObject<Set<string>>
    ) => {
      const tabsStr = serializeToCompactFormat(tabs)
      if (!tabsStr) return

      // Check which tabs need label updates
      const tabsNeedingUpdate = tabs.filter(
        tab => !labelsUpdated.current.has(tab.id)
      )
      if (tabsNeedingUpdate.length === 0) return

      try {
        const updatedTabs = await parseCompactTabFormatAsync(tabsStr, tabs)
        // Mark all tabs as updated
        updatedTabs.forEach(tab => labelsUpdated.current.add(tab.id))
        // Only update if labels changed
        const hasChanges = updatedTabs.some(
          (tab, idx) => tab.label !== tabs[idx]?.label
        )
        if (hasChanges) {
          setTabs(updatedTabs)
        }
      } catch {
        // Keep existing tabs if async fetch fails
      }
    },
    []
  )

  // Effect to update left tabs labels when tabs change
  useEffect(() => {
    const currentStr = serializeToCompactFormat(leftTabs)
    if (currentStr !== leftTabsUrl.current) {
      leftTabsUrl.current = currentStr
      // Reset labels updated set when tabs change (new tabs added)
      leftLabelsUpdated.current = new Set()
    }
    updateTabLabels(leftTabs, setLeftTabs, leftLabelsUpdated)
  }, [leftTabs, setLeftTabs, updateTabLabels])

  // Effect to update right tabs labels when tabs change
  useEffect(() => {
    const currentStr = serializeToCompactFormat(rightTabs)
    if (currentStr !== rightTabsUrl.current) {
      rightTabsUrl.current = currentStr
      // Reset labels updated set when tabs change (new tabs added)
      rightLabelsUpdated.current = new Set()
    }
    updateTabLabels(rightTabs, setRightTabs, rightLabelsUpdated)
  }, [rightTabs, setRightTabs, updateTabLabels])

  const handleSplitterResize = (event: SplitterEvent): void => {
    const leftSize = Math.round(event.sizes[0])
    setSplitterSize(leftSize.toString())
  }

  const handleSplitterResizeEnd = (event: SplitterEvent): void => {
    const leftSize = Math.round(event.sizes[0])
    const totalWidth = window.innerWidth
    setLeftPanelWidth((totalWidth * leftSize) / 100)
    setRightPanelWidth((totalWidth * (100 - leftSize)) / 100)
  }

  // Central function to move tabs between panels
  const moveTabBetweenPanels = (tab: Tab, fromSide: 'left' | 'right'): void => {
    if (fromSide === 'left') {
      // Move from left to right
      const movedTabIndex = leftTabs.findIndex(t => t.id === tab.id)
      const newLeftTabs = leftTabs.filter(t => t.id !== tab.id)
      const newRightTabs = [...rightTabs, tab]

      setLeftTabs(newLeftTabs)
      setRightTabs(newRightTabs)
      setActiveRightTab(tab.id)

      // Update active tab in left panel if needed
      if (activeLeftTab === tab.id) {
        if (newLeftTabs.length > 0) {
          // Activate the previous tab or the next one if it was the first
          const newActiveIndex = Math.min(
            movedTabIndex > 0 ? movedTabIndex - 1 : 0,
            newLeftTabs.length - 1
          )
          setActiveLeftTab(newLeftTabs[newActiveIndex].id)
        } else {
          setActiveLeftTab('')
        }
      }
    } else {
      // Move from right to left
      const movedTabIndex = rightTabs.findIndex(t => t.id === tab.id)
      const newRightTabs = rightTabs.filter(t => t.id !== tab.id)
      const newLeftTabs = [...leftTabs, tab]

      setRightTabs(newRightTabs)
      setLeftTabs(newLeftTabs)
      setActiveLeftTab(tab.id)

      // Update active tab in right panel if needed
      if (activeRightTab === tab.id) {
        if (newRightTabs.length > 0) {
          // Activate the previous tab or the next one if it was the first
          const newActiveIndex = Math.min(
            movedTabIndex > 0 ? movedTabIndex - 1 : 0,
            newRightTabs.length - 1
          )
          setActiveRightTab(newRightTabs[newActiveIndex].id)
        } else {
          setActiveRightTab('')
        }
      }
    }

    // Clear drag state
    setDraggedTab(null)
  }

  // Calculate initial sizes for splitter
  const leftSize = parseInt(splitterSize, 10)
  const rightSize = 100 - leftSize

  return (
    <DockProvider>
      <div className="splitter-layout">
        <Splitter
          layout="horizontal"
          onResize={handleSplitterResize}
          onResizeEnd={handleSplitterResizeEnd}
          resizerStyle={{ background: '#e2e8f0', width: '4px' }}
        >
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

export default SplitterLayout
