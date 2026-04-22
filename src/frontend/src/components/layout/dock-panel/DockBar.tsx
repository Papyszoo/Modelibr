import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { useEffect, useRef } from 'react'

import { DraggableTab } from '@/components/layout/DraggableTab'
import { useDockContext } from '@/contexts/DockContext'
import { useTabMenuItems } from '@/hooks/useTabMenuItems'
import { type Tab } from '@/types'

import { useDockPanelActions } from './DockPanelActionsContext'

export type DockPlacement = 'left' | 'right' | 'top' | 'bottom'
export type DockOrientation = 'vertical' | 'horizontal'

interface DockBarProps {
  /** Where this bar sits relative to the content area. Drives orientation + border. */
  placement: DockPlacement
  tabs: Tab[]
  activeTab: string
  onTabSelect: (tabId: string) => void
}

const ORIENTATION_BY_PLACEMENT: Record<DockPlacement, DockOrientation> = {
  left: 'vertical',
  right: 'vertical',
  top: 'horizontal',
  bottom: 'horizontal',
}

/** Tooltips appear on the side opposite the bar so they don't cover the icon. */
const TOOLTIP_BY_PLACEMENT: Record<
  DockPlacement,
  'left' | 'right' | 'top' | 'bottom'
> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
}

export function DockBar({
  placement,
  tabs,
  activeTab,
  onTabSelect,
}: DockBarProps) {
  const {
    closeTab,
    onTabDragStart,
    onTabDragEnd,
    addTab,
    reopenTab,
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  } = useDockPanelActions()
  const menuRef = useRef<ContextMenu>(null)
  const {
    recentlyClosedTabs,
    registerContextMenu,
    unregisterContextMenu,
    showContextMenu,
  } = useDockContext()

  const orientation = ORIENTATION_BY_PLACEMENT[placement]
  const tooltipPosition = TOOLTIP_BY_PLACEMENT[placement]

  const addMenuItems = useTabMenuItems({
    onAddTab: addTab,
    recentlyClosedTabs,
    onReopenTab: reopenTab,
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
      className={`dock-bar dock-bar--${orientation} dock-bar--placement-${placement} dock-bar-${placement}`}
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
            onClose={() => closeTab(tab.id)}
            onDragStart={onTabDragStart}
            onDragEnd={onTabDragEnd}
            tooltipPosition={tooltipPosition}
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
