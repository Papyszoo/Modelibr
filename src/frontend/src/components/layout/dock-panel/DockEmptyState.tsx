import { useRef } from 'react'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Tab } from '../../../types'

interface DockEmptyStateProps {
  onAddTab: (type: Tab['type'], title: string) => void
  recentlyClosedTabs: Tab[]
  onReopenTab: (tab: Tab) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export default function DockEmptyState({
  onAddTab,
  recentlyClosedTabs,
  onReopenTab,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: DockEmptyStateProps) {
  const contextMenuRef = useRef<ContextMenu>(null)

  // Menu items for adding new tabs (same as DockBar)
  const addMenuItems: MenuItem[] = [
    {
      label: 'Models List',
      icon: 'pi pi-list',
      command: () => onAddTab('modelList', 'Models'),
    },
    {
      label: 'Texture Sets',
      icon: 'pi pi-folder',
      command: () => onAddTab('textureSets', 'Texture Sets'),
    },
    {
      label: 'Packs',
      icon: 'pi pi-inbox',
      command: () => onAddTab('packs', 'Packs'),
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
