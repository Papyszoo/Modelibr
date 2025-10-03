import { useRef } from 'react'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Tab } from '../../../types'

interface DockEmptyStateProps {
  onAddTab: (type: Tab['type'], title: string) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export default function DockEmptyState({
  onAddTab,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: DockEmptyStateProps) {
  const contextMenuRef = useRef<ContextMenu>(null)

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
