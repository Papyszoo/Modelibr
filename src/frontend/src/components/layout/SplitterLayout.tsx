import { useState } from 'react'
import { Splitter, SplitterPanel } from 'primereact/splitter'
import { Button } from 'primereact/button'
import { useQueryState } from 'nuqs'
import DockPanel from './DockPanel'
import { Tab, SplitterEvent } from '../../types'
import {
  parseCompactTabFormat,
  serializeToCompactFormat,
} from '../../utils/tabSerialization'
import './SplitterLayout.css'

function SplitterLayout(): JSX.Element {
  // Global drag state for cross-panel tab dragging
  const [draggedTab, setDraggedTab] = useState<Tab | null>(null)

  // Local state for splitter size (percentage for left panel)
  const [splitterSize, setSplitterSize] = useState<number>(50)

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
    setSplitterSize(leftSize)
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
  const leftSize = splitterSize
  const rightSize = 100 - leftSize

  // Determine which arrow buttons to show
  const isAtLeftEdge = leftSize <= 1
  const isAtRightEdge = leftSize >= 99
  const isAtCenter = !isAtLeftEdge && !isAtRightEdge

  // Handler to toggle splitter position
  const handleToggleLeft = (): void => {
    if (isAtLeftEdge) {
      // Return to center
      setSplitterSize(50)
    } else {
      // Move to left edge (right panel takes full width)
      setSplitterSize(1)
    }
  }

  const handleToggleRight = (): void => {
    if (isAtRightEdge) {
      // Return to center
      setSplitterSize(50)
    } else {
      // Move to right edge (left panel takes full width)
      setSplitterSize(99)
    }
  }

  return (
    <div className="splitter-layout">
      <Splitter
        layout="horizontal"
        onResize={handleSplitterResize}
        resizerStyle={{ background: '#e2e8f0', width: '4px' }}
      >
        <SplitterPanel size={leftSize} minSize={1}>
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
        <SplitterPanel size={rightSize} minSize={1}>
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
      <div className="splitter-controls">
        {(isAtCenter || isAtRightEdge) && (
          <Button
            icon="pi pi-chevron-left"
            onClick={handleToggleLeft}
            className="splitter-toggle-button"
            size="small"
            text
            aria-label={
              isAtRightEdge ? 'Return to center' : 'Expand left panel'
            }
          />
        )}
        {(isAtCenter || isAtLeftEdge) && (
          <Button
            icon="pi pi-chevron-right"
            onClick={handleToggleRight}
            className="splitter-toggle-button"
            size="small"
            text
            aria-label={
              isAtLeftEdge ? 'Return to center' : 'Expand right panel'
            }
          />
        )}
      </div>
    </div>
  )
}

export default SplitterLayout
