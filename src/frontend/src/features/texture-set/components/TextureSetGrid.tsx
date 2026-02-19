import { useState, useRef, useEffect } from 'react'
import { Dialog } from 'primereact/dialog'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import './TextureSetGrid.css'
import {
  TextureSetDto,
  TextureType,
  TextureChannel,
  PackDto,
  TextureSetKind,
} from '@/types'
import { ProgressBar } from 'primereact/progressbar'
import { addTextureSetToPack, getAllPacks } from '@/features/pack/api/packApi'
import {
  addTextureToSetEndpoint,
  hardDeleteTextureSet,
  softDeleteTextureSet,
  regenerateTextureSetThumbnail,
} from '@/features/texture-set/api/textureSetApi'
import { getFilePreviewUrl } from '@/features/models/api/modelApi'
import { baseURL } from '@/lib/apiBase'
import { MergeTextureSetDialog } from '@/features/texture-set/dialogs/MergeTextureSetDialog'
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import {
  openInFileExplorer,
  copyPathToClipboard,
  getCopyPathSuccessMessage,
} from '@/utils/webdavUtils'

// Interface for channel merge request (must match MergeTextureSetDialog)
interface ChannelMergeRequest {
  fileId: number
  mappings: Array<{
    channel: TextureChannel
    textureType: TextureType
  }>
}

interface TextureSetGridProps {
  textureSets: TextureSetDto[]
  loading?: boolean
  onTextureSetSelect: (textureSet: TextureSetDto) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onTextureSetRecycled?: (textureSetId: number) => void
  onTextureSetUpdated?: () => void
}

export function TextureSetGrid({
  textureSets,
  loading = false,
  onTextureSetSelect,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onTextureSetRecycled,
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
  const isShowingMergeDialog = useRef(false)

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.textureSets

  useEffect(() => {
    loadPacks()
  }, [])

  const loadPacks = async () => {
    try {
      const data = await getAllPacks()
      setPacks(data)
    } catch (error) {
      console.error('Failed to load packs:', error)
    }
  }

  const handleAddToPack = async (packId: number) => {
    if (!selectedTextureSet) return

    try {
      await addTextureSetToPack(packId, selectedTextureSet.id)
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

  const handleSoftDelete = async () => {
    if (!selectedTextureSet) return

    try {
      await softDeleteTextureSet(selectedTextureSet.id)
      toast.current?.show({
        severity: 'success',
        summary: 'Recycled',
        detail: 'Texture set moved to recycled files',
        life: 3000,
      })
      // Call the callback to remove the texture set from the list without making a new request
      if (onTextureSetRecycled) {
        onTextureSetRecycled(selectedTextureSet.id)
      }
    } catch (error) {
      console.error('Failed to recycle texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to recycle texture set',
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
    // Only clear draggedTextureSet if we're not showing the merge dialog
    // If merge dialog is being shown, it will clear the state when it's hidden
    if (!isShowingMergeDialog.current) {
      setDraggedTextureSet(null)
    }
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

      // Check if source has any textures
      if (
        !draggedTextureSet.textures ||
        draggedTextureSet.textures.length === 0
      ) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Source texture set has no textures to merge',
          life: 3000,
        })
        setDraggedTextureSet(null)
        setDragOverCardId(null)
        return
      }

      // Store both values before showing the dialog
      // Set flag to prevent drag end from clearing the dragged texture set
      isShowingMergeDialog.current = true
      setDropTargetTextureSet(targetTextureSet)
      setShowMergeDialog(true)
    }

    setDragOverCardId(null)
  }

  const handleMergeTextureSets = async (requests: ChannelMergeRequest[]) => {
    if (!draggedTextureSet || !dropTargetTextureSet) return

    try {
      // Add each texture mapping to the target set
      for (const request of requests) {
        for (const mapping of request.mappings) {
          await addTextureToSetEndpoint(dropTargetTextureSet.id, {
            fileId: request.fileId,
            textureType: mapping.textureType,
            sourceChannel: mapping.channel,
          })
        }
      }

      // Hard delete the source texture set after successful merge (keeps the files)
      await hardDeleteTextureSet(draggedTextureSet.id)

      const textureCount = requests.reduce(
        (sum, r) => sum + r.mappings.length,
        0
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Merged ${textureCount} texture${textureCount !== 1 ? 's' : ''} successfully`,
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
    isShowingMergeDialog.current = false
  }

  const getAlbedoTextureUrl = (textureSet: TextureSetDto) => {
    // For Universal (Global Materials) texture sets, prefer the generated sphere thumbnail
    if (
      textureSet.kind === TextureSetKind.Universal &&
      textureSet.thumbnailPath
    ) {
      return `${baseURL}/texture-sets/${textureSet.id}/thumbnail/file`
    }

    // Find albedo texture first, then fallback to diffuse
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuse = textureSet.textures?.find(
      t => t.textureType === TextureType.Diffuse
    )

    const texture = albedo || diffuse
    if (texture) {
      return getFilePreviewUrl(texture.fileId.toString())
    }
    return null
  }

  const filteredTextureSets = textureSets.filter(textureSet => {
    const name = textureSet.name.toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  // Handle "Show in Folder" from context menu
  const handleShowInFolder = async () => {
    // Texture sets are in the TextureSets folder
    const virtualPath = 'TextureSets'
    const result = await openInFileExplorer(virtualPath)
    toast.current?.show({
      severity: result.success ? 'info' : 'warn',
      summary: result.success ? 'Opening' : 'Note',
      detail: result.message,
      life: 4000,
    })
  }

  // Handle "Copy Path" from context menu
  const handleCopyPath = async () => {
    // Texture sets are in the TextureSets folder
    const virtualPath = 'TextureSets'
    const result = await copyPathToClipboard(virtualPath)

    toast.current?.show({
      severity: result.success ? 'success' : 'error',
      summary: result.success ? 'Copied' : 'Failed',
      detail: result.success
        ? getCopyPathSuccessMessage()
        : 'Failed to copy path to clipboard',
      life: 5000,
    })
  }

  // Handle "Regenerate Thumbnail" from context menu
  const handleRegenerateThumbnail = async () => {
    if (!selectedTextureSet) return

    try {
      await regenerateTextureSetThumbnail(selectedTextureSet.id)
      toast.current?.show({
        severity: 'success',
        summary: 'Thumbnail',
        detail: 'Thumbnail regeneration started',
        life: 3000,
      })
      if (onTextureSetUpdated) {
        onTextureSetUpdated()
      }
    } catch (error) {
      console.error('Failed to regenerate thumbnail:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to regenerate thumbnail',
        life: 3000,
      })
    }
  }

  const contextMenuItems: MenuItem[] = [
    {
      label: 'Show in Folder',
      icon: 'pi pi-folder-open',
      command: handleShowInFolder,
    },
    {
      label: 'Copy Folder Path',
      icon: 'pi pi-copy',
      command: handleCopyPath,
    },
    {
      separator: true,
    },
    {
      label: 'Regenerate Thumbnail',
      icon: 'pi pi-refresh',
      command: handleRegenerateThumbnail,
      visible: selectedTextureSet?.kind === TextureSetKind.Universal,
    },
    {
      label: 'Add to pack',
      icon: 'pi pi-box',
      command: () => {
        loadPacks()
        setShowPackDialog(true)
      },
    },
    {
      label: 'Recycle',
      icon: 'pi pi-trash',
      command: () => {
        handleSoftDelete()
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
          <CardWidthSlider
            value={cardWidth}
            min={120}
            max={400}
            onChange={width => setCardWidth('textureSets', width)}
          />
        </div>
      </div>

      {/* Grid of texture set cards */}
      <div
        className="texture-set-grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
        }}
      >
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
          <div className="pack-select-list">
            {packs.map(pack => (
              <div
                key={pack.id}
                className="pack-select-item"
                onClick={() => handleAddToPack(pack.id)}
              >
                <i className="pi pi-box" />
                <div className="pack-select-item-content">
                  <span className="pack-select-item-name">{pack.name}</span>
                  {pack.description && (
                    <span className="pack-select-item-description">
                      {pack.description}
                    </span>
                  )}
                </div>
                <i className="pi pi-chevron-right" />
              </div>
            ))}
          </div>
          {packs.length === 0 && (
            <div className="pack-select-no-packs">
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
