import { Tab } from '../../types'
import DockBar from './dock-panel/DockBar'
import DockEmptyState from './dock-panel/DockEmptyState'
import DockContentArea from './dock-panel/DockContentArea'
import './DockPanel.css'

interface DockPanelProps {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  otherTabs: Tab[]
  setOtherTabs: (tabs: Tab[]) => void
  otherActiveTab: string
  setOtherActiveTab: (tabId: string) => void
  draggedTab: Tab | null
  setDraggedTab: (tab: Tab | null) => void
  moveTabBetweenPanels: (tab: Tab, fromSide: 'left' | 'right') => void
}

function DockPanel({
  side,
  tabs,
  setTabs,
  activeTab,
  setActiveTab,
  otherTabs: _otherTabs,
  setOtherTabs: _setOtherTabs,
  otherActiveTab: _otherActiveTab, // prefix with underscore to indicate intentionally unused
  setOtherActiveTab: _setOtherActiveTab,
  draggedTab,
  setDraggedTab,
  moveTabBetweenPanels,
}: DockPanelProps): JSX.Element {
  const addTab = (type: Tab['type'], title: string): void => {
    const newTab: Tab = {
      id: type,
      type,
      label: title,
    }

    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const closeTab = (tabId: string): void => {
    const newTabs = tabs.filter(tab => tab.id !== tabId)
    setTabs(newTabs)

    // If the closed tab was active, switch to the first available tab
    if (activeTab === tabId) {
      if (newTabs.length > 0) {
        setActiveTab(newTabs[0].id)
      } else {
        setActiveTab('')
      }
    }
  }

  const handleTabDragStart = (tab: Tab): void => {
    setDraggedTab(tab)
  }

  const handleTabDragEnd = (): void => {
    setDraggedTab(null)
  }

  const handleDropOnOtherPanel = (e: React.DragEvent): void => {
    e.preventDefault()
    // Only process drop if there's a dragged tab and it's not from this panel
    if (draggedTab && !tabs.some(tab => tab.id === draggedTab.id)) {
      // Determine which panel the dragged tab came from
      const fromSide = side === 'left' ? 'right' : 'left'
      moveTabBetweenPanels(draggedTab, fromSide)
    }
    // Always remove drag visual feedback after drop attempt
    e.currentTarget.classList.remove('drag-over')
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    // Only allow drop if there's a dragged tab and it's not from this panel
    if (draggedTab && !tabs.some(tab => tab.id === draggedTab.id)) {
      e.dataTransfer.dropEffect = 'move'
    }
  }

  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault()
    // Add visual feedback for valid drop zone
    if (draggedTab && !tabs.some(tab => tab.id === draggedTab.id)) {
      e.currentTarget.classList.add('drag-over')
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    // Remove visual feedback - only if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      e.currentTarget.classList.remove('drag-over')
    }
  }

  const activeTabData = tabs.find(tab => tab.id === activeTab)

  return (
    <div className={`dock-panel dock-panel-${side}`}>
      {/* Dock/Menu Bar */}
      <DockBar
        side={side}
        tabs={tabs}
        activeTab={activeTab}
        onTabSelect={setActiveTab}
        onTabClose={closeTab}
        onTabDragStart={handleTabDragStart}
        onTabDragEnd={handleTabDragEnd}
        onAddTab={addTab}
        onDrop={handleDropOnOtherPanel}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      />

      {/* Content Area */}
      <div className="dock-content">
        {activeTabData ? (
          <DockContentArea
            side={side}
            tabs={tabs}
            setTabs={setTabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            activeTabData={activeTabData}
          />
        ) : (
          <DockEmptyState
            onAddTab={addTab}
            onDrop={handleDropOnOtherPanel}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
          />
        )}
      </div>
    </div>
  )
}

export default DockPanel
