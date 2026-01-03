import { Tooltip } from 'primereact/tooltip'
import { Tab } from '../../types'
import './DraggableTab.css'

const getTabIcon = (tabType: Tab['type']): string => {
  switch (tabType) {
    case 'modelList':
      return 'pi pi-list'
    case 'modelViewer':
      return 'pi pi-box'
    case 'textureSets':
      return 'pi pi-folder'
    case 'textureSetViewer':
      return 'pi pi-image'
    case 'packs':
      return 'pi pi-inbox'
    case 'packViewer':
      return 'pi pi-folder-open'
    case 'projects':
      return 'pi pi-briefcase'
    case 'projectViewer':
      return 'pi pi-briefcase'
    case 'settings':
      return 'pi pi-cog'
    case 'history':
      return 'pi pi-history'
    case 'recycledFiles':
      return 'pi pi-trash'
    case 'sprites':
      return 'pi pi-image'
    default:
      return 'pi pi-file'
  }
}

const getTabTooltip = (tab: Tab): string => {
  switch (tab.type) {
    case 'modelList':
      return 'Models List'
    case 'modelViewer':
      return `Model: ${tab.label || tab.modelId || 'Unknown'}`
    case 'textureSets':
      return 'Texture Sets'
    case 'textureSetViewer': {
      return `Texture Set: ${tab.label || tab.setId || 'Unknown'}`
    }
    case 'packs':
      return 'Packs'
    case 'packViewer': {
      return `Pack: ${tab.label || tab.packId || 'Unknown'}`
    }
    case 'projects':
      return 'Projects'
    case 'projectViewer':
      return `Project: ${tab.label || tab.projectId || 'Unknown'}`
    case 'settings':
      return 'Settings'
    case 'history':
      return 'Upload History'
    case 'recycledFiles':
      return 'Recycled Files'
    case 'sprites':
      return 'Sprites'
    case 'stageEditor':
      return 'Stage Editor'
    case 'stageList':
      return 'Stages List'
    default:
      return tab.label || 'Unknown Tab'
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
  side,
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

  const handleMouseDown = (e: React.MouseEvent): void => {
    // Middle button click (button === 1) should close the tab
    // This follows browser tab conventions and doesn't interfere with:
    // - Left button (0): used for selection and dragging
    // - Right button (2): used for context menu
    if (e.button === 1) {
      e.preventDefault() // Prevent default middle button behavior (e.g., auto-scroll)
      e.stopPropagation() // Prevent tab selection when closing
      onClose()
    }
  }

  const tooltipId = `tab-tooltip-${tab.id}`
  // Position tooltip on the opposite side of the tab panel to avoid covering the icon
  const tooltipPosition = side === 'left' ? 'right' : 'left'

  return (
    <>
      <Tooltip
        target={`#${CSS.escape(tooltipId)}`}
        showDelay={0}
        hideDelay={0}
      />
      <div
        id={tooltipId}
        className={`draggable-tab ${isActive ? 'active' : ''}`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        data-pr-tooltip={getTabTooltip(tab)}
        data-pr-position={tooltipPosition}
      >
        {/* Tab content - always show icon for now */}
        <i className={`${getTabIcon(tab.type)} tab-icon`}></i>

        {/* Close button in top right corner */}
        <button
          className="tab-close-btn p-component"
          onClick={handleCloseClick}
          aria-label="Close tab"
        >
          ×
        </button>
      </div>
    </>
  )
}

export default DraggableTab
