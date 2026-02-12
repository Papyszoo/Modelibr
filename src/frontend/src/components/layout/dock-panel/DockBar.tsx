import { useRef, useEffect } from 'react'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import DraggableTab from '@/components/layout/DraggableTab'
import { Tab } from '@/types'
import { useDockContext } from '@/contexts/DockContext'
import { useTabMenuItems } from '@/hooks/useTabMenuItems'

interface DockBarProps {
  side: 'left' | 'right'
  tabs: Tab[]
  activeTab: string
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabDragStart: (tab: Tab) => void
  onTabDragEnd: () => void
  onAddTab: (type: Tab['type'], title: string) => void
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
  onReopenTab,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: DockBarProps) {
  const menuRef = useRef<ContextMenu>(null)
  const {
    recentlyClosedTabs,
    registerContextMenu,
    unregisterContextMenu,
    showContextMenu,
  } = useDockContext()

  const addMenuItems = useTabMenuItems({
    onAddTab,
    recentlyClosedTabs,
    onReopenTab,
  })

  useEffect(() => {
    const menu = menuRef.current

    if (menu) {
      registerContextMenu(menuRef)
    }

    return () => {
      if (menu) {
        unregisterContextMenu(menuRef)
      }
    }
  }, [registerContextMenu, unregisterContextMenu])

  const handleBarContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    showContextMenu(menuRef, e)
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
          autoZIndex
        />
      </div>
    </div>
  )
}
