import { useState, useEffect } from 'react'
import { Splitter, SplitterPanel } from 'primereact/splitter'
import { useQueryState } from 'nuqs'
import DockPanel from './DockPanel'
import { Tab, SplitterEvent } from '../../types'
import {
  parseCompactTabFormat,
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
    defaultValue: [{ id: 'models', type: 'modelList' }] as Tab[],
    parse: (value): Tab[] =>
      parseCompactTabFormat(value, [{ id: 'models', type: 'modelList' }]),
    serialize: serializeToCompactFormat,
  })

  // URL state for right panel tabs
  const [rightTabs, setRightTabs] = useQueryState('rightTabs', {
    defaultValue: [] as Tab[],
    parse: (value): Tab[] => parseCompactTabFormat(value, []),
    serialize: serializeToCompactFormat,
  })

  // URL state for active tabs
  const [activeLeftTab, setActiveLeftTab] = useQueryState('activeLeft', {
    defaultValue: 'models',
    parse: value => value || 'models',
    serialize: value => value,
  })

  const [activeRightTab, setActiveRightTab] = useQueryState('activeRight', {
    defaultValue: '',
    parse: value => value || '',
    serialize: value => value,
  })

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
      const newLeftTabs = leftTabs.filter(t => t.id !== tab.id)
      const newRightTabs = [...rightTabs, tab]

      setLeftTabs(newLeftTabs)
      setRightTabs(newRightTabs)
      setActiveRightTab(tab.id)

      // Update active tab in left panel if needed
      if (activeLeftTab === tab.id) {
        if (newLeftTabs.length > 0) {
          setActiveLeftTab(newLeftTabs[0].id)
        } else {
          setActiveLeftTab('')
        }
      }
    } else {
      // Move from right to left
      const newRightTabs = rightTabs.filter(t => t.id !== tab.id)
      const newLeftTabs = [...leftTabs, tab]

      setRightTabs(newRightTabs)
      setLeftTabs(newLeftTabs)
      setActiveLeftTab(tab.id)

      // Update active tab in right panel if needed
      if (activeRightTab === tab.id) {
        if (newRightTabs.length > 0) {
          setActiveRightTab(newRightTabs[0].id)
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
  )
}

export default SplitterLayout
