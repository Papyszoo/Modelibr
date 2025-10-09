import { useRef } from 'react'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import DraggableTab from '../DraggableTab'
import { Tab } from '../../../types'

interface DockBarProps {
  side: 'left' | 'right'
  tabs: Tab[]
  activeTab: string
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabDragStart: (tab: Tab) => void
  onTabDragEnd: () => void
  onAddTab: (type: Tab['type'], title: string) => void
  recentlyClosedTabs: Tab[]
  onReopenTab: (tab: Tab) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export default function DockBar({
  side,
  tabs,
  activeTab,
  onTabSelect,
  onTabClose,
  onTabDragStart,
  onTabDragEnd,
  onAddTab,
  recentlyClosedTabs,
  onReopenTab,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: DockBarProps) {
  const menuRef = useRef<ContextMenu>(null)

  // Menu items for adding new tabs
  const addMenuItems: MenuItem[] = [
    {
      label: 'Models List',
      icon: 'pi pi-list',
      command: () => onAddTab('modelList', 'Models'),
    },
    {
      label: 'Textures List',
      icon: 'pi pi-image',
      command: () => onAddTab('texture', 'Textures'),
    },
    {
      label: 'Texture Sets',
      icon: 'pi pi-folder',
      command: () => onAddTab('textureSets', 'Texture Sets'),
    },
    {
      label: 'Animations List',
      icon: 'pi pi-play',
      command: () => onAddTab('animation', 'Animations'),
    },
    {
      separator: true,
    },
    {
      label: 'Settings',
      icon: 'pi pi-cog',
      command: () => onAddTab('settings', 'Settings'),
    },
  ]

  // Add recently closed tabs to menu if any exist
  if (recentlyClosedTabs.length > 0) {
    addMenuItems.push(
      {
        separator: true,
      },
      ...recentlyClosedTabs.map(tab => ({
        label: `Reopen: ${tab.label || tab.type}`,
        icon: 'pi pi-history',
        command: () => onReopenTab(tab),
      }))
    )
  }

  const handleBarContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    menuRef.current?.show(e)
  }

  return (
    <div
      className={`dock-bar dock-bar-${side}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onContextMenu={handleBarContextMenu}
    >
      {/* Tab icons */}
      <div className="dock-tabs">
        {tabs.map(tab => (
          <DraggableTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTab}
            onSelect={() => onTabSelect(tab.id)}
            onClose={() => onTabClose(tab.id)}
            onDragStart={onTabDragStart}
            onDragEnd={onTabDragEnd}
            side={side}
          />
        ))}
      </div>

      {/* Add tab button */}
      <div className="dock-add">
        <Button
          icon="pi pi-plus"
          className="p-button-text p-button-rounded dock-add-button"
          onClick={e => menuRef.current?.show(e)}
        />
        <ContextMenu
          model={addMenuItems}
          ref={menuRef}
          className="dock-add-menu"
        />
      </div>
    </div>
  )
}
