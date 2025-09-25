import { Button } from 'primereact/button'
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

  const handleClick = (e: React.MouseEvent): void => {
    // Don't select tab if clicking close button
    if ((e.target as Element).closest('.tab-close-button')) {
      return
    }
    onSelect()
  }

  const handleCloseClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
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

      {/* Close button */}
      <Button
        icon="pi pi-times"
        className="p-button-text p-button-rounded tab-close-button"
        onClick={handleCloseClick}
        size="small"
      />
    </div>
  )
}

export default DraggableTab
