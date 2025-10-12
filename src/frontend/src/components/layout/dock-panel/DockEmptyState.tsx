import { useRef } from 'react'
import { ContextMenu } from 'primereact/contextmenu'
import { Tab } from '../../../types'
import { useDockContext } from '../../../contexts/DockContext'
import { useTabMenuItems } from '../../../hooks/useTabMenuItems'

interface DockEmptyStateProps {
  onAddTab: (type: Tab['type'], title: string) => void
  onReopenTab: (tab: Tab) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export default function DockEmptyState({
  onAddTab,
  onReopenTab,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: DockEmptyStateProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const { recentlyClosedTabs } = useDockContext()

  const addMenuItems = useTabMenuItems({
    onAddTab,
    recentlyClosedTabs,
    onReopenTab,
  })

  const handleEmptyAreaContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    contextMenuRef.current?.show(e)
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
      <i
        className="pi pi-plus"
        style={{ fontSize: '3rem', color: '#6b7280' }}
      ></i>
      <h3>No tabs open</h3>
      <p>Click the + button to add a new tab</p>
      <ContextMenu
        model={addMenuItems}
        ref={contextMenuRef}
        className="dock-add-menu"
      />
    </div>
  )
}
