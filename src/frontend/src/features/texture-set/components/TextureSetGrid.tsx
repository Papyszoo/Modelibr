import { useState, useRef, useEffect } from 'react'
import { Dialog } from 'primereact/dialog'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import './TextureSetGrid.css'
import { TextureSetDto, TextureType, PackDto } from '../../../types'
import { ProgressBar } from 'primereact/progressbar'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import MergeTextureSetDialog from '../dialogs/MergeTextureSetDialog'

interface TextureSetGridProps {
  textureSets: TextureSetDto[]
  loading?: boolean
  onTextureSetSelect: (textureSet: TextureSetDto) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onTextureSetUpdated?: () => void
}

export default function TextureSetGrid({
  textureSets,
  loading = false,
  onTextureSetSelect,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onTextureSetUpdated,
}: TextureSetGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [packs, setPacks] = useState<PackDto[]>([])
  const [selectedTextureSet, setSelectedTextureSet] =
    useState<TextureSetDto | null>(null)
  const [showPackDialog, setShowPackDialog] = useState(false)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [draggedTextureSet, setDraggedTextureSet] =
    useState<TextureSetDto | null>(null)
  const [dropTargetTextureSet, setDropTargetTextureSet] =
    useState<TextureSetDto | null>(null)
  const [dragOverCardId, setDragOverCardId] = useState<number | null>(null)
  const contextMenu = useRef<ContextMenu>(null)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadPacks()
  }, [])

  const loadPacks = async () => {
    try {
      const data = await ApiClient.getAllPacks()
      setPacks(data)
    } catch (error) {
      console.error('Failed to load packs:', error)
    }
  }

  const handleAddToPack = async (packId: number) => {
    if (!selectedTextureSet) return

    try {
      await ApiClient.addTextureSetToPack(packId, selectedTextureSet.id)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set added to pack',
        life: 3000,
      })
      setShowPackDialog(false)
    } catch (error) {
      console.error('Failed to add texture set to pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add texture set to pack',
        life: 3000,
      })
    }
  }

  const handleCardDragStart = (
    e: React.DragEvent,
    textureSet: TextureSetDto
  ) => {
    e.stopPropagation()
    setDraggedTextureSet(textureSet)
    // Set drag data to distinguish between file drops and texture set drops
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(
      'application/x-texture-set-id',
      textureSet.id.toString()
    )
  }

  const handleCardDragEnd = (e: React.DragEvent) => {
    e.stopPropagation()
    setDraggedTextureSet(null)
    setDragOverCardId(null)
  }

  const handleCardDragOver = (
    e: React.DragEvent,
    textureSet: TextureSetDto
  ) => {
    // Check if this is a texture set being dragged (not a file)
    if (e.dataTransfer.types.includes('application/x-texture-set-id')) {
      e.preventDefault()
      e.stopPropagation()
      setDragOverCardId(textureSet.id)
    }
  }

  const handleCardDragLeave = (
    e: React.DragEvent,
    textureSet: TextureSetDto
  ) => {
    e.stopPropagation()
    if (dragOverCardId === textureSet.id) {
      setDragOverCardId(null)
    }
  }

  const handleCardDrop = (
    e: React.DragEvent,
    targetTextureSet: TextureSetDto
  ) => {
    e.preventDefault()
    e.stopPropagation()

    // Check if this is a texture set being dragged (not a file)
    const draggedSetId = e.dataTransfer.getData('application/x-texture-set-id')
    if (draggedSetId && draggedTextureSet) {
      // Prevent dropping on itself
      if (draggedTextureSet.id === targetTextureSet.id) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Cannot merge a texture set with itself',
          life: 3000,
        })
        setDraggedTextureSet(null)
        setDragOverCardId(null)
        return
      }

      // Check if source has an albedo texture
      const albedoTexture = draggedTextureSet.textures?.find(
        t => t.textureType === TextureType.Albedo
      )

      if (!albedoTexture) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Source texture set does not have an Albedo texture to merge',
          life: 3000,
        })
        setDraggedTextureSet(null)
        setDragOverCardId(null)
        return
      }

      // Check if source has other textures besides Albedo
      const hasOtherTextures = draggedTextureSet.textures?.some(
        t => t.textureType !== TextureType.Albedo
      )

      if (hasOtherTextures) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Warning',
          detail:
            'Source texture set has other textures besides Albedo. Only texture sets with Albedo only can be merged.',
          life: 3000,
        })
        setDraggedTextureSet(null)
        setDragOverCardId(null)
        return
      }

      // Store both values before showing the dialog
      // This ensures React has the latest state when dialog renders
      setDropTargetTextureSet(targetTextureSet)
      // Use setTimeout to ensure state is updated before showing dialog
      setTimeout(() => {
        setShowMergeDialog(true)
        console.log('Opening merge dialog', {
          source: draggedTextureSet?.name,
          target: targetTextureSet?.name,
        })
      }, 0)
    }

    setDragOverCardId(null)
  }

  const handleMergeTextureSets = async (textureType: TextureType) => {
    if (!draggedTextureSet || !dropTargetTextureSet) return

    try {
      // Find the albedo texture from the source set
      const albedoTexture = draggedTextureSet.textures?.find(
        t => t.textureType === TextureType.Albedo
      )

      if (!albedoTexture) {
        throw new Error('Source texture set does not have an Albedo texture')
      }

      // Add the texture to the target set with the selected type
      await ApiClient.addTextureToSetEndpoint(dropTargetTextureSet.id, {
        fileId: albedoTexture.fileId,
        textureType: textureType,
      })

      // Delete the source texture set after successful merge
      await ApiClient.deleteTextureSet(draggedTextureSet.id)

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Texture merged successfully as ${textureType}`,
        life: 3000,
      })

      // Refresh the texture sets if callback provided
      if (onTextureSetUpdated) {
        onTextureSetUpdated()
      }

      setShowMergeDialog(false)
      setDraggedTextureSet(null)
      setDropTargetTextureSet(null)
    } catch (error) {
      console.error('Failed to merge texture sets:', error)
      throw error
    }
  }

  const handleMergeDialogHide = () => {
    setShowMergeDialog(false)
    setDraggedTextureSet(null)
    setDropTargetTextureSet(null)
  }

  const getAlbedoTextureUrl = (textureSet: TextureSetDto) => {
    // Find albedo texture first, then fallback to diffuse
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuse = textureSet.textures?.find(
      t => t.textureType === TextureType.Diffuse
    )

    const texture = albedo || diffuse
    if (texture) {
      return ApiClient.getFileUrl(texture.fileId.toString())
    }
    return null
  }

  const filteredTextureSets = textureSets.filter(textureSet => {
    const name = textureSet.name.toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  const contextMenuItems: MenuItem[] = [
    {
      label: 'Add to pack',
      icon: 'pi pi-box',
      command: () => {
        loadPacks()
        setShowPackDialog(true)
      },
    },
  ]

  // Loading state
  if (loading) {
    return (
      <div className="texture-set-grid-loading">
        <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
        <p>Loading texture sets...</p>
      </div>
    )
  }

  // Empty state (no texture sets at all)
  if (textureSets.length === 0) {
    return (
      <div
        className="texture-set-grid-empty"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      >
        <i className="pi pi-images" />
        <h3>No Texture Sets</h3>
        <p>Drag and drop texture files here to create new sets</p>
        <p className="hint">
          Each file will create a new texture set with an albedo texture
        </p>
      </div>
    )
  }

  return (
    <div
      className="texture-set-grid-container"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />
      <ContextMenu model={contextMenuItems} ref={contextMenu} />

      {/* Search and filter bar */}
      <div className="texture-set-grid-controls">
        <div className="search-bar">
          <i className="pi pi-search" />
          <input
            type="text"
            placeholder="Search texture sets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-bar">
          <span className="filter-placeholder">Filters (Coming Soon)</span>
        </div>
      </div>

      {/* Grid of texture set cards */}
      <div className="texture-set-grid">
        {filteredTextureSets.map(textureSet => {
          const albedoUrl = getAlbedoTextureUrl(textureSet)
          const isDraggedOver = dragOverCardId === textureSet.id

          return (
            <div
              key={textureSet.id}
              className={`texture-set-card ${isDraggedOver ? 'drag-over-card' : ''}`}
              draggable={true}
              onDragStart={e => handleCardDragStart(e, textureSet)}
              onDragEnd={handleCardDragEnd}
              onDragOver={e => handleCardDragOver(e, textureSet)}
              onDragLeave={e => handleCardDragLeave(e, textureSet)}
              onDrop={e => handleCardDrop(e, textureSet)}
              onClick={() => onTextureSetSelect(textureSet)}
              onContextMenu={e => {
                e.preventDefault()
                setSelectedTextureSet(textureSet)
                contextMenu.current?.show(e)
              }}
            >
              <div className="texture-set-card-thumbnail">
                {albedoUrl ? (
                  <img
                    src={albedoUrl}
                    alt={textureSet.name}
                    className="texture-set-image"
                  />
                ) : (
                  <div className="texture-set-placeholder">
                    <i className="pi pi-image" />
                    <span>No Preview</span>
                  </div>
                )}
                <div className="texture-set-card-overlay">
                  <span className="texture-set-card-name">
                    {textureSet.name}
                  </span>
                  <div className="texture-set-card-info">
                    <span className="texture-count">
                      <i className="pi pi-palette" />
                      {textureSet.textureCount || 0} texture
                      {textureSet.textureCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredTextureSets.length === 0 && (
        <div className="no-results">
          <i className="pi pi-search" />
          <p>No texture sets found matching "{searchQuery}"</p>
        </div>
      )}

      {/* Add to Pack Dialog */}
      <Dialog
        header="Add to Pack"
        visible={showPackDialog}
        style={{ width: '500px' }}
        onHide={() => setShowPackDialog(false)}
      >
        <div className="pack-selection-dialog">
          <p>Select a pack to add this texture set to:</p>
          <div className="pack-list">
            {packs.map(pack => (
              <div
                key={pack.id}
                className="pack-item"
                onClick={() => handleAddToPack(pack.id)}
              >
                <i className="pi pi-box" />
                <div className="pack-item-content">
                  <span className="pack-item-name">{pack.name}</span>
                  {pack.description && (
                    <span className="pack-item-description">
                      {pack.description}
                    </span>
                  )}
                </div>
                <i className="pi pi-chevron-right" />
              </div>
            ))}
          </div>
          {packs.length === 0 && (
            <div className="no-packs">
              <i className="pi pi-inbox" />
              <p>No packs available. Create a pack first.</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Merge Texture Set Dialog */}
      <MergeTextureSetDialog
        visible={showMergeDialog}
        sourceTextureSet={draggedTextureSet}
        targetTextureSet={dropTargetTextureSet}
        onHide={handleMergeDialogHide}
        onMerge={handleMergeTextureSets}
      />
    </div>
  )
}
