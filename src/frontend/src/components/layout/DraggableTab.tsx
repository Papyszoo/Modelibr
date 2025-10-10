import { Tab } from '../../types'
import './DraggableTab.css'

const getTabIcon = (tabType: Tab['type']): string => {
  switch (tabType) {
    case 'modelList':
      return 'pi pi-list'
    case 'modelViewer':
      return 'pi pi-eye'
    case 'textureSets':
      return 'pi pi-folder'
    case 'textureSetViewer':
      return 'pi pi-image'
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
    case 'textureSets':
      return 'Texture Sets'
    case 'textureSetViewer':
      return `Texture Set: ${tab.setId || 'Unknown'}`
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

  const handleCloseClick = (e: React.MouseEvent): void => {
    e.stopPropagation() // Prevent tab selection when clicking close
    onClose()
  }

  return (
    <div
      className={`draggable-tab ${isActive ? 'active' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      title={getTabTooltip(tab)}
    >
      {/* Tab content - always show icon for now */}
      <i className={`${getTabIcon(tab.type)} tab-icon`}></i>

      {/* Close button in top right corner */}
      <button
        className="tab-close-btn"
        onClick={handleCloseClick}
        aria-label="Close tab"
      >
        <i className="pi pi-times"></i>
      </button>
    </div>
  )
}

export default DraggableTab
