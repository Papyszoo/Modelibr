import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useMemo, useRef } from 'react'

import { DraggableTab } from '@/components/layout/DraggableTab'
import { useDockContext } from '@/contexts/DockContext'
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
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  } = useDockPanelActions()
  const menuRef = useRef<ContextMenu>(null)
  const { registerContextMenu, unregisterContextMenu, showContextMenu } =
    useDockContext()

  const orientation = ORIENTATION_BY_PLACEMENT[placement]
  const tooltipPosition = TOOLTIP_BY_PLACEMENT[placement]

  // The right-click context menu used to mirror every tab type as a power-user
  // shortcut. Picking what to open now lives entirely in the New Tab page
  // (tiles + Recently Closed), so the menu shrinks to a single entry whose
  // only job is to get the user to that page.
  const addMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: 'New Tab',
        icon: 'pi pi-plus',
        command: () => addTab('newTab', 'New Tab'),
      },
    ],
    [addTab]
  )

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

  const handleAddClick = (): void => {
    // Open a New Tab page (grid of asset-type tiles + recently closed). The
    // user picks the type there; the placeholder tab converts itself in place.
    addTab('newTab', 'New Tab')
  }

  const handleBarMouseDown = (e: React.MouseEvent): void => {
    // Middle-click on empty bar space opens a New Tab. Middle-click on a tab
    // closes that tab (handled in DraggableTab with stopPropagation), so this
    // only fires when the click lands on the bar background or the + button —
    // both of which should yield a New Tab.
    if (e.button === 1) {
      e.preventDefault() // Suppress autoscroll cursor.
      addTab('newTab', 'New Tab')
    }
  }

  return (
    <div
      className={`dock-bar dock-bar--${orientation} dock-bar--placement-${placement} dock-bar-${placement}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onContextMenu={handleBarContextMenu}
      onMouseDown={handleBarMouseDown}
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

      {/* Add tab button — opens the New Tab page. Right-click on the bar
          shows the same shortcut as a context menu entry. */}
      <div className="dock-add">
        <Button
          icon="pi pi-plus"
          className="p-button-text p-button-rounded dock-add-button"
          onClick={handleAddClick}
          aria-label="Open new tab"
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
