import { Button } from 'primereact/button'
import './DraggableTab.css'

const getTabIcon = (tabType) => {
  switch (tabType) {
    case 'modelList':
      return 'pi pi-list'
    case 'modelDetails':
      return 'pi pi-eye'
    case 'textureList':
      return 'pi pi-image'
    case 'animationList':
      return 'pi pi-play'
    default:
      return 'pi pi-file'
  }
}

const getTabTooltip = (tab) => {
  if (tab.title) {
    return tab.title
  }
  
  switch (tab.type) {
    case 'modelList':
      return 'Models List'
    case 'modelDetails':
      return `Model: ${tab.data?.name || tab.data?.id || 'Unknown'}`
    case 'textureList':
      return 'Textures List'
    case 'animationList':
      return 'Animations List'
    default:
      return 'Unknown Tab'
  }
}

function DraggableTab({ 
  tab, 
  isActive, 
  onSelect, 
  onClose, 
  onDragStart, 
  onDragEnd,
  side 
}) {
  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.id)
    onDragStart(tab)
  }

  const handleDragEnd = () => {
    onDragEnd()
  }

  const handleClick = (e) => {
    // Don't select tab if clicking close button
    if (e.target.closest('.tab-close-button')) {
      return
    }
    onSelect()
  }

  const handleCloseClick = (e) => {
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
      {/* Tab content based on type */}
      {tab.type === 'modelDetails' && tab.data?.thumbnailUrl ? (
        <div className="tab-thumbnail">
          <img 
            src={tab.data.thumbnailUrl} 
            alt={`Model ${tab.data.id}`}
            className="tab-thumbnail-img"
          />
        </div>
      ) : (
        <i className={`${getTabIcon(tab.type)} tab-icon`}></i>
      )}

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