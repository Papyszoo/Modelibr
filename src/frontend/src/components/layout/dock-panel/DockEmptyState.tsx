import { ContextMenu } from 'primereact/contextmenu'
import { useEffect, useRef } from 'react'

import { useDockContext } from '@/contexts/DockContext'
import { useTabMenuItems } from '@/hooks/useTabMenuItems'

import { useDockPanelActions } from './DockPanelActionsContext'

export function DockEmptyState() {
  const { addTab, reopenTab, onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDockPanelActions()
  const contextMenuRef = useRef<ContextMenu>(null)
  const {
    recentlyClosedTabs,
    registerContextMenu,
    unregisterContextMenu,
    showContextMenu,
  } = useDockContext()

  const addMenuItems = useTabMenuItems({
    onAddTab: addTab,
    recentlyClosedTabs,
    onReopenTab: reopenTab,
  })

  useEffect(() => {
    const menu = contextMenuRef.current

    if (menu) {
      registerContextMenu(contextMenuRef)
    }

    return () => {
      if (menu) {
        unregisterContextMenu(contextMenuRef)
      }
    }
  }, [registerContextMenu, unregisterContextMenu])

  const handleEmptyAreaContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    showContextMenu(contextMenuRef, e)
  }

  return (
    <div
      className="dock-empty"
      onContextMenu={handleEmptyAreaContextMenu}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <i className="pi pi-plus" style={{ fontSize: '3rem' }}></i>
      <h3>No tabs open</h3>
      <p>Click the + button to add a new tab</p>
      <ContextMenu
        model={addMenuItems}
        ref={contextMenuRef}
        className="dock-add-menu"
        autoZIndex
      />
    </div>
  )
}
