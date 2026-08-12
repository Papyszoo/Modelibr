import './SpriteList.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import {
  type DragEvent,
  type MouseEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import { getFilePreviewUrl, getFileUrl } from '@/features/models/api/modelApi'
import { useSpriteListData } from '@/features/sprite/hooks/useSpriteListData'
import { useSpriteMutations } from '@/features/sprite/hooks/useSpriteMutations'
import { useSpriteUpload } from '@/features/sprite/hooks/useSpriteUpload'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { CategoryTreePanel } from '@/shared/components/categories/CategoryTreePanel'
import { LoadingState } from '@/shared/components/feedback'
import {
  ListToolbar,
  ListToolbarActions,
  ListToolbarButton,
  ListToolbarCount,
  ListToolbarPanel,
  ListToolbarRow,
  ListToolbarSearchInput,
  ListToolbarSelectionActions,
  ListToolbarSelectionBar,
  ListToolbarSelectionSummary,
  OptionsButton,
} from '@/shared/components/list-toolbar'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import {
  ALL_CATEGORIES_ID,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'
import { spriteRenameFormSchema } from '@/shared/validation/formSchemas'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type SpriteDto } from '@/types'
import {
  copyPathToClipboard,
  getCopyPathSuccessMessage,
  openInFileExplorer,
} from '@/utils/webdavUtils'

import { SpriteGridContent } from './SpriteGridContent'

export function SpriteList() {
  type SpriteRenameFormValues = z.infer<typeof spriteRenameFormSchema>

  // ── UI State ────────────────────────────────────────────────────────
  const [showSpriteModal, setShowSpriteModal] = useState(false)
  const [selectedSprite, setSelectedSprite] = useState<SpriteDto | null>(null)
  const [isEditingSpriteName, setIsEditingSpriteName] = useState(false)
  const [isSavingSpriteName, setIsSavingSpriteName] = useState(false)
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(
    null
  )
  const [draggedSpriteId, setDraggedSpriteId] = useState<number | null>(null)
  const [selectedSpriteIds, setSelectedSpriteIds] = useState<Set<number>>(
    new Set()
  )
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const [contextMenuTarget, setContextMenuTarget] = useState<SpriteDto | null>(
    null
  )
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // ── Refs ────────────────────────────────────────────────────────────
  const spriteGridRef = useRef<HTMLDivElement>(null)
  const toast = useRef<Toast>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<ContextMenu>(null)

  // ── Forms ───────────────────────────────────────────────────────────
  const {
    register: registerSpriteRename,
    handleSubmit: handleSpriteRenameSubmit,
    reset: resetSpriteRenameForm,
  } = useForm<SpriteRenameFormValues>({
    resolver: zodResolver(spriteRenameFormSchema),
    mode: 'onChange',
    defaultValues: { name: '' },
  })

  // ── Store ───────────────────────────────────────────────────────────
  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.sprites
  const uploadProgressContext = useUploadProgress()

  // ── Data Hook ───────────────────────────────────────────────────────
  const {
    sprites,
    categories,
    loading,
    totalCount,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    activeCategoryId,
    setActiveCategoryId,
    searchQuery,
    setSearchQuery,
    filteredSprites,
    invalidateSprites,
    loadCategories,
  } = useSpriteListData()

  // ── Mutations Hook ──────────────────────────────────────────────────
  const {
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveSpritesToCategoryMutation,
    recycleSpritesMutation,
    renameSpriteMutation,
  } = useSpriteMutations({
    categories,
    activeCategoryId,
    setActiveCategoryId,
    setSelectedSpriteIds,
    setContextMenuTarget,
    setSelectedSprite,
    setIsEditingSpriteName,
    resetSpriteRenameForm,
    setIsSavingSpriteName,
    invalidateSprites,
    loadCategories,
    showToast: opts => toast.current?.show(opts),
    toast,
  })

  // ── Upload Hook ─────────────────────────────────────────────────────
  const { handleFileDrop } = useSpriteUpload({
    activeCategoryId,
    uploadProgressContext,
    invalidateSprites,
    toast,
  })

  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileDrop)

  // ── Sprite Modal Handlers ──────────────────────────────────────────
  const openSpriteModal = (sprite: SpriteDto) => {
    setSelectedSprite(sprite)
    resetSpriteRenameForm({ name: sprite.name })
    setIsEditingSpriteName(false)
    setShowSpriteModal(true)
  }

  const handleSaveSpriteName = handleSpriteRenameSubmit(values => {
    if (!selectedSprite) return
    const trimmedName = values.name
    if (!trimmedName || trimmedName === selectedSprite.name) {
      setIsEditingSpriteName(false)
      resetSpriteRenameForm({ name: selectedSprite.name })
      return
    }
    setIsSavingSpriteName(true)
    renameSpriteMutation.mutate({
      sprite: selectedSprite,
      newName: trimmedName,
    })
  })

  const handleDownload = async () => {
    if (!selectedSprite) return
    try {
      const url = getFileUrl(selectedSprite.fileId.toString())
      const response = await fetch(url)
      const blob = await response.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      const extension = selectedSprite.fileName.split('.').pop() || 'png'
      link.download = `${selectedSprite.name}.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch (error) {
      console.error('Failed to download sprite:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to download sprite',
        life: 3000,
      })
    }
  }

  // ── Selection & Drag ───────────────────────────────────────────────
  const toggleSpriteSelection = (spriteId: number, e: MouseEvent) => {
    e.stopPropagation()
    setSelectedSpriteIds(prev => {
      const next = new Set(prev)
      if (next.has(spriteId)) next.delete(spriteId)
      else next.add(spriteId)
      return next
    })
  }

  const clearSelection = () => setSelectedSpriteIds(new Set())

  const handleGridMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('.sprite-card')) return
    if (spriteGridRef.current) {
      // NOTE: spriteGridRef IS the scroll container (.sprite-grid-container has
      // overflow: auto), so its bounding rect stays fixed while the content
      // scrolls - the scrollLeft/scrollTop term below is REQUIRED to map the
      // cursor into the scrolled content. This differs from the model /
      // texture-set / environment-map grids, where the rect comes from a
      // non-scrolling selection-surface child and adding scroll would
      // double-count it. Don't "simplify" this by removing the scroll terms.
      const rect = spriteGridRef.current.getBoundingClientRect()
      setIsAreaSelecting(true)
      setSelectionBox({
        startX: e.clientX - rect.left + spriteGridRef.current.scrollLeft,
        startY: e.clientY - rect.top + spriteGridRef.current.scrollTop,
        currentX: e.clientX - rect.left + spriteGridRef.current.scrollLeft,
        currentY: e.clientY - rect.top + spriteGridRef.current.scrollTop,
      })
    }
  }

  const handleGridMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isAreaSelecting || !selectionBox || !spriteGridRef.current) return
    const gridRef = spriteGridRef.current
    const rect = gridRef.getBoundingClientRect()
    setSelectionBox(prev =>
      prev
        ? {
            ...prev,
            currentX: e.clientX - rect.left + gridRef.scrollLeft,
            currentY: e.clientY - rect.top + gridRef.scrollTop,
          }
        : null
    )
  }

  const handleGridMouseUp = () => {
    if (isAreaSelecting && selectionBox && spriteGridRef.current) {
      const rect = spriteGridRef.current.getBoundingClientRect()
      const selectionLeft = Math.min(selectionBox.startX, selectionBox.currentX)
      const selectionTop = Math.min(selectionBox.startY, selectionBox.currentY)
      const selectionRight = Math.max(
        selectionBox.startX,
        selectionBox.currentX
      )
      const selectionBottom = Math.max(
        selectionBox.startY,
        selectionBox.currentY
      )

      const cards = spriteGridRef.current.querySelectorAll('.sprite-card')
      const newSelected = new Set<number>()

      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const cardLeft =
          cardRect.left - rect.left + spriteGridRef.current!.scrollLeft
        const cardTop =
          cardRect.top - rect.top + spriteGridRef.current!.scrollTop
        const cardRight = cardLeft + cardRect.width
        const cardBottom = cardTop + cardRect.height

        if (
          cardRight >= selectionLeft &&
          cardLeft <= selectionRight &&
          cardBottom >= selectionTop &&
          cardTop <= selectionBottom
        ) {
          const spriteId = card.getAttribute('data-sprite-id')
          if (spriteId) newSelected.add(parseInt(spriteId, 10))
        }
      })

      if (newSelected.size > 0) setSelectedSpriteIds(newSelected)
    }
    setIsAreaSelecting(false)
    setSelectionBox(null)
  }

  const handleSpriteDragStart = (
    e: DragEvent<HTMLDivElement>,
    sprite: SpriteDto
  ) => {
    // See SoundList.handleSoundDragStart for why we don't auto-select
    // the dragged item here: a state-driven layout shift inside the
    // toolbar (the selection bar appearing) cancels the native HTML5
    // drag mid-flight, so `drop` never fires.
    setDraggedSpriteId(sprite.id)
    e.dataTransfer.effectAllowed = 'move'
    const spriteIdsToMove = selectedSpriteIds.has(sprite.id)
      ? Array.from(selectedSpriteIds)
      : [sprite.id]
    e.dataTransfer.setData('text/plain', spriteIdsToMove.join(','))
  }

  const handleSpriteDragEnd = () => {
    setDraggedSpriteId(null)
    setDragOverCategoryId(null)
  }

  // ── Category Drag-to-Move ──────────────────────────────────────────
  const handleCategoryDragOver = (
    e: DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedSpriteId !== null) setDragOverCategoryId(categoryId)
  }

  const handleCategoryDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCategoryId(null)
  }

  const handleCategoryDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>, targetCategoryId: number | null) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverCategoryId(null)
      if (draggedSpriteId === null) return
      const newCategoryId =
        targetCategoryId === UNASSIGNED_CATEGORY_ID ? null : targetCategoryId
      const spriteIdsToMove = selectedSpriteIds.has(draggedSpriteId)
        ? Array.from(selectedSpriteIds)
        : [draggedSpriteId]
      const spritesToMove = sprites.filter(
        s => spriteIdsToMove.includes(s.id) && s.categoryId !== newCategoryId
      )
      if (spritesToMove.length === 0) {
        setDraggedSpriteId(null)
        return
      }
      moveSpritesToCategoryMutation.mutate({
        spriteIds: spritesToMove.map(s => s.id),
        categoryId: newCategoryId,
      })
      setDraggedSpriteId(null)
    },
    [draggedSpriteId, selectedSpriteIds, sprites, moveSpritesToCategoryMutation]
  )

  // ── Context Menu ───────────────────────────────────────────────────
  const handleShowInFolder = async () => {
    let virtualPath = 'Sprites'
    if (
      activeCategoryId !== null &&
      activeCategoryId !== UNASSIGNED_CATEGORY_ID
    ) {
      const category = categories.find(c => c.id === activeCategoryId)
      if (category) virtualPath = `Sprites/${category.name}`
    }
    const result = await openInFileExplorer(virtualPath)
    toast.current?.show({
      severity: result.success ? 'info' : 'warn',
      summary: result.success ? 'Opening' : 'Note',
      detail: result.message,
      life: 4000,
    })
  }

  const handleCopyPath = async () => {
    let virtualPath = 'Sprites'
    if (
      activeCategoryId !== null &&
      activeCategoryId !== UNASSIGNED_CATEGORY_ID
    ) {
      const category = categories.find(c => c.id === activeCategoryId)
      if (category) virtualPath = `Sprites/${category.name}`
    }
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

  const handleRecycleSprites = () => {
    const spriteIdsToRecycle =
      selectedSpriteIds.size > 0
        ? Array.from(selectedSpriteIds)
        : contextMenuTarget
          ? [contextMenuTarget.id]
          : []
    if (spriteIdsToRecycle.length === 0) return
    recycleSpritesMutation.mutate(spriteIdsToRecycle)
  }

  const getContextMenuItems = (): MenuItem[] => {
    const selectedCount = selectedSpriteIds.size
    const label =
      selectedCount > 1 ? `Recycle ${selectedCount} sprites` : 'Recycle'
    return [
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
      { separator: true },
      { label, icon: 'pi pi-trash', command: handleRecycleSprites },
    ]
  }

  // Per-category counts for the sidebar tree (from the loaded sprites).
  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const sprite of sprites) {
      if (sprite.categoryId != null) {
        counts.set(sprite.categoryId, (counts.get(sprite.categoryId) ?? 0) + 1)
      }
    }
    return counts
  }, [sprites])
  const unassignedCount = useMemo(
    () => sprites.filter(s => s.categoryId == null).length,
    [sprites]
  )

  const handleSpriteContextMenu = (
    e: React.MouseEvent<HTMLDivElement>,
    sprite: SpriteDto
  ) => {
    e.preventDefault()
    if (!selectedSpriteIds.has(sprite.id))
      setSelectedSpriteIds(new Set([sprite.id]))
    setContextMenuTarget(sprite)
    contextMenuRef.current?.show(e)
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className="sprite-list"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />
      <ContextMenu ref={contextMenuRef} model={getContextMenuItems()} />

      <ListToolbar>
        <ListToolbarRow>
          <ListToolbarActions>
            <ListToolbarButton
              icon="pi pi-search"
              label="Search"
              active={isSearchOpen || searchQuery.trim().length > 0}
              onClick={() => setIsSearchOpen(open => !open)}
              ariaLabel="Search"
              ariaExpanded={isSearchOpen}
              ariaControls="sprite-list-search-panel"
            />
            <OptionsButton
              cardWidth={cardWidth}
              minCardWidth={120}
              maxCardWidth={400}
              onCardWidthChange={width => setCardWidth('sprites', width)}
              showThumbnailAnimation={false}
            />
            <ListToolbarButton
              icon="pi pi-refresh"
              label="Refresh"
              onClick={() => void invalidateSprites()}
              tooltip="Refresh list"
              ariaLabel="Refresh"
            />
          </ListToolbarActions>

          <ListToolbarCount
            icon="pi pi-images"
            count={filteredSprites.length}
            unitLabel="sprite"
          />
        </ListToolbarRow>

        {selectedSpriteIds.size > 0 ? (
          <ListToolbarSelectionBar>
            <ListToolbarSelectionSummary>
              {selectedSpriteIds.size} sprite
              {selectedSpriteIds.size === 1 ? '' : 's'} selected.
            </ListToolbarSelectionSummary>
            <ListToolbarSelectionActions>
              <ListToolbarButton
                icon="pi pi-times"
                label="Clear"
                onClick={clearSelection}
              />
            </ListToolbarSelectionActions>
          </ListToolbarSelectionBar>
        ) : null}

        <ListToolbarPanel id="sprite-list-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search sprites..."
          />
        </ListToolbarPanel>
      </ListToolbar>

      <div className="sprite-list-body">
        <aside className="sprite-category-sidebar">
          <CategoryTreePanel
            categories={categories}
            activeCategoryId={activeCategoryId}
            dragOverCategoryId={dragOverCategoryId}
            categoryCounts={categoryCounts}
            unassignedCount={unassignedCount}
            allCount={sprites.length}
            allCategoryId={ALL_CATEGORIES_ID}
            unassignedCategoryId={UNASSIGNED_CATEGORY_ID}
            unassignedLabel="Unassigned"
            itemNoun="sprite"
            onCategoryChange={setActiveCategoryId}
            onCategoryDragOver={handleCategoryDragOver}
            onCategoryDragLeave={handleCategoryDragLeave}
            onCategoryDrop={handleCategoryDrop}
            onCreateCategory={(name, parentId) =>
              createCategoryMutation.mutate({ name, parentId })
            }
            onRenameCategory={(category, name) =>
              renameCategoryMutation.mutate({ category, name })
            }
            onDeleteCategory={category =>
              deleteCategoryMutation.mutate(category.id)
            }
          />
        </aside>

        <div className="sprite-list-main">
          {loading ? (
            <LoadingState
              className="sprite-list-loading"
              message="Loading sprites…"
            />
          ) : (
            <SpriteGridContent
              filteredSprites={filteredSprites}
              cardWidth={cardWidth}
              selectedSpriteIds={selectedSpriteIds}
              draggedSpriteId={draggedSpriteId}
              spriteGridRef={spriteGridRef}
              isAreaSelecting={isAreaSelecting}
              selectionBox={selectionBox}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              totalCount={totalCount}
              totalSpritesCount={sprites.length}
              onToggleSelection={toggleSpriteSelection}
              onSpriteClick={openSpriteModal}
              onContextMenu={handleSpriteContextMenu}
              onSpriteDragStart={handleSpriteDragStart}
              onSpriteDragEnd={handleSpriteDragEnd}
              onGridMouseDown={handleGridMouseDown}
              onGridMouseMove={handleGridMouseMove}
              onGridMouseUp={handleGridMouseUp}
              onLoadMore={() => fetchNextPage()}
            />
          )}
        </div>
      </div>

      <div className="sprite-drop-overlay">
        <i className="pi pi-upload" />
        <span>Drop images here</span>
      </div>

      {/* Sprite Detail Modal */}
      <Dialog
        header={
          selectedSprite ? (
            <div
              className="sprite-modal-header"
              data-testid="sprite-modal-header"
            >
              {isEditingSpriteName ? (
                <div className="sprite-name-edit">
                  <InputText
                    {...registerSpriteRename('name')}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveSpriteName()
                      if (e.key === 'Escape') {
                        setIsEditingSpriteName(false)
                        resetSpriteRenameForm({ name: selectedSprite.name })
                      }
                    }}
                    autoFocus
                    data-testid="sprite-name-input"
                    style={{ width: '300px' }}
                  />
                  <Button
                    icon="pi pi-check"
                    className="p-button-text p-button-rounded"
                    onClick={handleSaveSpriteName}
                    disabled={isSavingSpriteName}
                    tooltip="Save"
                    data-testid="sprite-name-save"
                  />
                  <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-rounded"
                    onClick={() => {
                      setIsEditingSpriteName(false)
                      resetSpriteRenameForm({ name: selectedSprite.name })
                    }}
                    disabled={isSavingSpriteName}
                    tooltip="Cancel"
                    data-testid="sprite-name-cancel"
                  />
                </div>
              ) : (
                <div className="sprite-name-display">
                  <span data-testid="sprite-name-display">
                    {selectedSprite.name}
                  </span>
                  <Button
                    icon="pi pi-pencil"
                    className="p-button-text p-button-rounded"
                    onClick={() => {
                      setIsEditingSpriteName(true)
                      resetSpriteRenameForm({ name: selectedSprite.name })
                    }}
                    tooltip="Edit name"
                    data-testid="sprite-name-edit"
                  />
                </div>
              )}
            </div>
          ) : (
            'Sprite'
          )
        }
        visible={showSpriteModal}
        onHide={() => {
          setShowSpriteModal(false)
          setIsEditingSpriteName(false)
          if (selectedSprite)
            resetSpriteRenameForm({ name: selectedSprite.name })
        }}
        style={{ width: '600px' }}
        className="sprite-detail-modal"
        data-testid="sprite-detail-modal"
      >
        {selectedSprite && (
          <div className="sprite-modal-content">
            <div className="sprite-modal-preview">
              <img
                src={getFilePreviewUrl(selectedSprite.fileId.toString())}
                alt={selectedSprite.name}
              />
            </div>
            <div className="sprite-modal-info">
              <div className="sprite-modal-details">
                <p>
                  <strong>Type:</strong>{' '}
                  {getSpriteTypeName(selectedSprite.spriteType)}
                </p>
                <p>
                  <strong>File:</strong> {selectedSprite.fileName}
                </p>
                <p>
                  <strong>Size:</strong>{' '}
                  {formatFileSize(selectedSprite.fileSizeBytes)}
                </p>
                <p>
                  <strong>Category:</strong>{' '}
                  {selectedSprite.categoryName || 'Unassigned'}
                </p>
              </div>
              <div className="sprite-modal-download">
                <Button
                  label="Download"
                  icon="pi pi-download"
                  onClick={handleDownload}
                  className="p-button-success w-full"
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={e => {
          if (e.target.files) handleFileDrop(e.target.files)
        }}
      />
    </div>
  )
}

// ── Utility functions used in sprite detail modal ─────────────────────
function getSpriteTypeName(type: number): string {
  switch (type) {
    case 1:
      return 'Static'
    case 2:
      return 'Sprite Sheet'
    case 3:
      return 'GIF'
    case 4:
      return 'APNG'
    case 5:
      return 'Animated WebP'
    default:
      return 'Unknown'
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
