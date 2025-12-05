import { Tooltip } from 'primereact/tooltip'
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
    case 'packs':
      return 'pi pi-inbox'
    case 'packViewer':
      return 'pi pi-folder-open'
    case 'projects':
      return 'pi pi-briefcase'
    case 'projectViewer':
      return 'pi pi-briefcase'
    case 'animation':
      return 'pi pi-play'
    case 'settings':
      return 'pi pi-cog'
    case 'history':
      return 'pi pi-history'
    case 'recycledFiles':
      return 'pi pi-trash'
    default:
      return 'pi pi-file'
  }
}

const getTabTooltip = (tab: Tab): string => {
  switch (tab.type) {
    case 'modelList':
      return 'Models List'
    case 'modelViewer': {
      // If label exists and is not just "Model {id}", use it as the name
      // Otherwise fall back to showing the ID
      const modelName =
        tab.label && !tab.label.match(/^Model \d+$/) ? tab.label : tab.modelId
      return `Model: ${modelName || 'Unknown'}`
    }
    case 'texture':
      return 'Textures List'
    case 'textureSets':
      return 'Texture Sets'
    case 'textureSetViewer': {
      // If label exists and is not just "Set {id}", use it as the name
      const setName =
        tab.label && !tab.label.match(/^Set \d+$/) ? tab.label : tab.setId
      return `Texture Set: ${setName || 'Unknown'}`
    }
    case 'packs':
      return 'Packs'
    case 'packViewer': {
      // If label exists and is not just "Pack {id}", use it as the name
      const packName =
        tab.label && !tab.label.match(/^Pack \d+$/) ? tab.label : tab.packId
      return `Pack: ${packName || 'Unknown'}`
    }
    case 'projects':
      return 'Projects'
    case 'projectViewer': {
      // If label exists and is not just "Project {id}", use it as the name
      const projectName =
        tab.label && !tab.label.match(/^Project \d+$/)
          ? tab.label
          : tab.projectId
      return `Project: ${projectName || 'Unknown'}`
    }
    case 'animation':
      return 'Animations List'
    case 'settings':
      return 'Settings'
    case 'history':
      return 'Upload History'
    case 'recycledFiles':
      return 'Recycled Files'
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
          className="tab-close-btn"
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
