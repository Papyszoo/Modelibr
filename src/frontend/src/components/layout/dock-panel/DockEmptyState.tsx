import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useMemo, useRef } from 'react'

import { useDockContext } from '@/contexts/DockContext'

import { useDockPanelActions } from './DockPanelActionsContext'

export function DockEmptyState() {
  const { addTab, onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDockPanelActions()
  const contextMenuRef = useRef<ContextMenu>(null)
  const { registerContextMenu, unregisterContextMenu, showContextMenu } =
    useDockContext()

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

  const handleClick = (): void => {
    addTab('newTab', 'New Tab')
  }

  return (
    <div
      className="dock-empty"
      onContextMenu={handleEmptyAreaContextMenu}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <i className="pi pi-plus" style={{ fontSize: '3rem' }}></i>
      <h3>No tabs open</h3>
      <p>Click here or the + button to open a new tab</p>
      <ContextMenu
        model={addMenuItems}
        ref={contextMenuRef}
        className="dock-add-menu"
        autoZIndex
      />
    </div>
  )
}
