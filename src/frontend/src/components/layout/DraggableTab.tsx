import { useRef } from 'react'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Tab } from '../../types'
import './DraggableTab.css'

const getTabIcon = (tabType: Tab['type']): string => {
  switch (tabType) {
    case 'modelList':
      return 'pi pi-list'
    case 'modelViewer':
      return 'pi pi-eye'
    case 'texture':
      return 'pi pi-image'
    case 'animation':
      return 'pi pi-play'
    case 'settings':
      return 'pi pi-cog'
    default:
      return 'pi pi-file'
  }
}

const getTabTooltip = (tab: Tab): string => {
  if (tab.label) {
    return tab.label
  }

  switch (tab.type) {
    case 'modelList':
      return 'Models List'
    case 'modelViewer':
      return `Model: ${tab.modelId || 'Unknown'}`
    case 'texture':
      return 'Textures List'
    case 'animation':
      return 'Animations List'
    case 'settings':
      return 'Settings'
    default:
      return 'Unknown Tab'
  }
}

interface DraggableTabProps {
  tab: Tab
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  onDragStart: (tab: Tab) => void
  onDragEnd: () => void
  side: 'left' | 'right'
}

function DraggableTab({
  tab,
  isActive,
  onSelect,
  onClose,
  onDragStart,
  onDragEnd,
  side: _side, // prefix with underscore to indicate intentionally unused
}: DraggableTabProps): JSX.Element {
  const contextMenuRef = useRef<ContextMenu>(null)

  const contextMenuItems: MenuItem[] = [
    {
      label: 'Close Tab',
      icon: 'pi pi-times',
      command: () => onClose(),
    },
  ]

  const handleDragStart = (e: React.DragEvent): void => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.id)
    onDragStart(tab)
  }

  const handleDragEnd = (): void => {
    onDragEnd()
  }

  const handleClick = (): void => {
    onSelect()
  }

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    contextMenuRef.current?.show(e)
  }

  return (
    <>
      <div
        className={`draggable-tab ${isActive ? 'active' : ''}`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={getTabTooltip(tab)}
      >
        {/* Tab content - always show icon for now */}
        <i className={`${getTabIcon(tab.type)} tab-icon`}></i>
      </div>

      <ContextMenu
        model={contextMenuItems}
        ref={contextMenuRef}
        className="tab-context-menu"
      />
    </>
  )
}

export default DraggableTab
