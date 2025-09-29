import { useRef } from 'react'
import { Button } from 'primereact/button'
import { Menu } from 'primereact/menu'
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
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: DockBarProps) {
  const menuRef = useRef<Menu>(null)

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
      label: 'Texture Packs',
      icon: 'pi pi-folder',
      command: () => onAddTab('texturePacks', 'Texture Packs'),
    },
    {
      label: 'Animations List',
      icon: 'pi pi-play',
      command: () => onAddTab('animation', 'Animations'),
    },
  ]

  return (
    <div
      className={`dock-bar dock-bar-${side}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
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
          onClick={e => menuRef.current?.toggle(e)}
          tooltip="Add new tab"
        />
        <Menu
          model={addMenuItems}
          popup
          ref={menuRef}
          className="dock-add-menu"
        />
      </div>
    </div>
  )
}