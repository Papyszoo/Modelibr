import { useState, useRef } from 'react'
import { Button } from 'primereact/button'
import { Menu } from 'primereact/menu'
import TabContent from './TabContent'
import DraggableTab from './DraggableTab'
import { TabProvider } from '../../hooks/useTabContext.jsx'
import './DockPanel.css'

function DockPanel({ 
  side, 
  tabs, 
  setTabs, 
  activeTab, 
  setActiveTab,
  otherTabs,
  setOtherTabs,
  otherActiveTab,
  setOtherActiveTab
}) {
  const [draggedTab, setDraggedTab] = useState(null)
  const menuRef = useRef(null)

  // Menu items for adding new tabs
  const addMenuItems = [
    {
      label: 'Models List',
      icon: 'pi pi-list',
      command: () => addTab('modelList', 'Models')
    },
    {
      label: 'Textures List', 
      icon: 'pi pi-image',
      command: () => addTab('textureList', 'Textures')
    },
    {
      label: 'Animations List',
      icon: 'pi pi-play',
      command: () => addTab('animationList', 'Animations')
    }
  ]

  const addTab = (type, title) => {
    const newTab = {
      id: `${type}-${Date.now()}`,
      type,
      title,
      data: null
    }
    
    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const closeTab = (tabId) => {
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

  const moveTabToOtherPanel = (tab) => {
    // Remove from current panel
    const newTabs = tabs.filter(t => t.id !== tab.id)
    setTabs(newTabs)
    
    // Add to other panel
    const newOtherTabs = [...otherTabs, tab]
    setOtherTabs(newOtherTabs)
    setOtherActiveTab(tab.id)
    
    // Update active tab in current panel
    if (activeTab === tab.id) {
      if (newTabs.length > 0) {
        setActiveTab(newTabs[0].id)
      } else {
        setActiveTab('')
      }
    }
  }

  const handleTabDragStart = (tab) => {
    setDraggedTab(tab)
  }

  const handleTabDragEnd = () => {
    setDraggedTab(null)
  }

  const handleDropOnOtherPanel = (e) => {
    e.preventDefault()
    if (draggedTab) {
      moveTabToOtherPanel(draggedTab)
      setDraggedTab(null)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const activeTabData = tabs.find(tab => tab.id === activeTab)

  return (
    <div className={`dock-panel dock-panel-${side}`}>
      {/* Dock/Menu Bar */}
      <div className={`dock-bar dock-bar-${side}`}>
        {/* Tab icons */}
        <div className="dock-tabs">
          {tabs.map(tab => (
            <DraggableTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTab}
              onSelect={() => setActiveTab(tab.id)}
              onClose={() => closeTab(tab.id)}
              onDragStart={handleTabDragStart}
              onDragEnd={handleTabDragEnd}
              side={side}
            />
          ))}
        </div>

        {/* Add tab button */}
        <div className="dock-add">
          <Button
            icon="pi pi-plus"
            className="p-button-text p-button-rounded dock-add-button"
            onClick={(event) => menuRef.current?.toggle(event)}
            tooltip="Add new tab"
            tooltipOptions={{ position: side === 'left' ? 'right' : 'left' }}
          />
          <Menu
            model={addMenuItems}
            popup
            ref={menuRef}
            className="dock-add-menu"
          />
        </div>
      </div>

      {/* Content Area */}
      <div 
        className="dock-content"
        onDrop={handleDropOnOtherPanel}
        onDragOver={handleDragOver}
      >
        {activeTabData ? (
          <TabProvider
            side={side}
            tabs={tabs}
            setTabs={setTabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          >
            <TabContent tab={activeTabData} />
          </TabProvider>
        ) : (
          <div className="dock-empty">
            <i className="pi pi-plus" style={{ fontSize: '3rem', color: '#6b7280' }}></i>
            <h3>No tabs open</h3>
            <p>Click the + button to add a new tab</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default DockPanel