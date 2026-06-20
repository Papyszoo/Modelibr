import './SoundList.css'
import '@/shared/components/FilterPanel.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { type ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputNumber } from 'primereact/inputnumber'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Toast } from 'primereact/toast'
import {
  type DragEvent,
  type MouseEvent,
  useCallback,
  useRef,
  useState,
} from 'react'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import { getFileUrl } from '@/features/models/api/modelApi'
import { useSoundListData } from '@/features/sounds/hooks/useSoundListData'
import { useSoundMutations } from '@/features/sounds/hooks/useSoundMutations'
import { useSoundUpload } from '@/features/sounds/hooks/useSoundUpload'
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
import { soundCategoryFormSchema } from '@/shared/validation/formSchemas'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type SoundCategoryDto, type SoundDto } from '@/types'
import {
  copyPathToClipboard,
  getCopyPathSuccessMessage,
  openInFileExplorer,
} from '@/utils/webdavUtils'

import { SoundCategoryDialog } from './SoundCategoryDialog'
import { SoundCategoryTabs } from './SoundCategoryTabs'
import { SoundContextMenu } from './SoundContextMenu'
import { SoundEditor } from './SoundEditor'
import { SoundGridContent } from './SoundGridContent'

const UNASSIGNED_CATEGORY_ID = -1

type SoundCategoryFormInput = z.input<typeof soundCategoryFormSchema>
type SoundCategoryFormOutput = z.output<typeof soundCategoryFormSchema>

export function SoundList() {
  const toast = useRef<Toast>(null)
  const contextMenuRef = useRef<ContextMenu>(null)
  const soundGridRef = useRef<HTMLDivElement>(null)

  const showToast = useCallback(
    (opts: {
      severity: string
      summary: string
      detail: string
      life: number
    }) => {
      toast.current?.show(opts as Parameters<Toast['show']>[0])
    },
    []
  )

  // --- Extracted hooks ---
  const {
    sounds,
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
    minDuration,
    setMinDuration,
    maxDuration,
    setMaxDuration,
    filteredSounds,
    invalidateSounds,
    loadCategories,
  } = useSoundListData(showToast)

  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showSoundModal, setShowSoundModal] = useState(false)
  const [editingCategory, setEditingCategory] =
    useState<SoundCategoryDto | null>(null)
  const [selectedSound, setSelectedSound] = useState<SoundDto | null>(null)
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(
    null
  )
  const [draggedSoundId, setDraggedSoundId] = useState<number | null>(null)
  const [selectedSoundIds, setSelectedSoundIds] = useState<Set<number>>(
    new Set()
  )
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const [contextMenuTarget, setContextMenuTarget] = useState<SoundDto | null>(
    null
  )
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const hasActiveDurationFilter = minDuration != null || maxDuration != null

  const {
    register: registerCategory,
    handleSubmit: handleCategorySubmit,
    reset: resetCategoryForm,
  } = useForm<SoundCategoryFormInput, unknown, SoundCategoryFormOutput>({
    resolver: zodResolver(soundCategoryFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.sounds

  const {
    saveCategoryMutation,
    deleteCategoryMutation,
    moveSoundsToCategoryMutation,
    recycleSoundsMutation,
  } = useSoundMutations({
    showToast,
    loadSounds: invalidateSounds,
    loadCategories,
    activeCategoryId,
    setActiveCategoryId,
    categories,
    setSelectedSoundIds,
    setContextMenuTarget,
  })

  const {
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
    fileInputRef,
    handleFileDrop,
  } = useSoundUpload({
    showToast,
    activeCategoryId,
    loadSounds: invalidateSounds,
  })

  const openCreateCategoryDialog = () => {
    setEditingCategory(null)
    resetCategoryForm({ name: '', description: '' })
    setShowCategoryDialog(true)
  }

  const openEditCategoryDialog = (category: SoundCategoryDto) => {
    setEditingCategory(category)
    resetCategoryForm({
      name: category.name,
      description: category.description || '',
    })
    setShowCategoryDialog(true)
  }

  const handleSaveCategory = handleCategorySubmit(
    values => {
      saveCategoryMutation.mutate(
        {
          editingCategory,
          name: values.name,
          description: values.description,
        },
        {
          onSuccess: () => {
            setShowCategoryDialog(false)
          },
        }
      )
    },
    () => {
      showToast({
        severity: 'warn',
        summary: 'Validation Error',
        detail: 'Category name is required',
        life: 3000,
      })
    }
  )

  const handleDeleteCategory = (category: SoundCategoryDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the category "${category.name}"? Sounds in this category will become unassigned.`,
      header: 'Delete Category',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        await deleteCategoryMutation.mutateAsync(category.id)
      },
    })
  }

  const openSoundModal = (sound: SoundDto) => {
    setSelectedSound(sound)
    setShowSoundModal(true)
  }

  const handleDownload = async () => {
    if (!selectedSound) return

    try {
      const url = getFileUrl(selectedSound.fileId.toString())
      const response = await fetch(url)
      const blob = await response.blob()

      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      const extension = selectedSound.fileName.split('.').pop() || 'mp3'
      link.download = `${selectedSound.name}.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch (error) {
      console.error('Failed to download sound:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to download sound',
        life: 3000,
      })
    }
  }

  const toggleSoundSelection = (soundId: number, e: MouseEvent) => {
    e.stopPropagation()
    setSelectedSoundIds(prev => {
      const next = new Set(prev)
      if (next.has(soundId)) {
        next.delete(soundId)
      } else {
        next.add(soundId)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedSoundIds(new Set())
  }

  const handleGridMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('.sound-card')) {
      return
    }
    if (soundGridRef.current) {
      // NOTE: soundGridRef IS the scroll container (.sound-grid-container has
      // overflow: auto), so its bounding rect stays fixed while the content
      // scrolls — the scrollLeft/scrollTop term below is REQUIRED to map the
      // cursor into the scrolled content. This differs from the model /
      // texture-set / environment-map grids, where the rect comes from a
      // non-scrolling selection-surface child and adding scroll would
      // double-count it. Don't "simplify" this by removing the scroll terms.
      const rect = soundGridRef.current.getBoundingClientRect()
      setIsAreaSelecting(true)
      setSelectionBox({
        startX: e.clientX - rect.left + soundGridRef.current.scrollLeft,
        startY: e.clientY - rect.top + soundGridRef.current.scrollTop,
        currentX: e.clientX - rect.left + soundGridRef.current.scrollLeft,
        currentY: e.clientY - rect.top + soundGridRef.current.scrollTop,
      })
    }
  }

  const handleGridMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isAreaSelecting || !selectionBox || !soundGridRef.current) return
    const gridRef = soundGridRef.current
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
    if (isAreaSelecting && selectionBox && soundGridRef.current) {
      const rect = soundGridRef.current.getBoundingClientRect()
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

      const cards = soundGridRef.current.querySelectorAll('.sound-card')
      const newSelected = new Set<number>()

      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const cardLeft =
          cardRect.left - rect.left + soundGridRef.current!.scrollLeft
        const cardTop =
          cardRect.top - rect.top + soundGridRef.current!.scrollTop
        const cardRight = cardLeft + cardRect.width
        const cardBottom = cardTop + cardRect.height

        if (
          cardRight >= selectionLeft &&
          cardLeft <= selectionRight &&
          cardBottom >= selectionTop &&
          cardTop <= selectionBottom
        ) {
          const soundId = card.getAttribute('data-sound-id')
          if (soundId) {
            newSelected.add(parseInt(soundId, 10))
          }
        }
      })

      if (newSelected.size > 0) {
        setSelectedSoundIds(newSelected)
      }
    }
    setIsAreaSelecting(false)
    setSelectionBox(null)
  }

  const handleSoundDragStart = (
    e: DragEvent<HTMLDivElement>,
    sound: SoundDto
  ) => {
    // Note: deliberately do NOT update `selectedSoundIds` here. Calling
    // `setSelectedSoundIds(new Set([sound.id]))` during `dragstart`
    // commits a state change before the next paint; the resulting
    // `ListToolbarSelectionBar` mount adds a new row to the toolbar
    // column, pushing the category-tabs / grid down. Chromium treats
    // that mid-drag layout shift as a cancellation and fires `dragend`
    // before `drop` — so `draggedSoundId` is null when
    // `handleCategoryDrop` runs and the move never happens. (Verified
    // by reproducing the docs/videos `Sounds Video` failure locally.)
    setDraggedSoundId(sound.id)
    e.dataTransfer.effectAllowed = 'move'
    const soundIdsToMove = selectedSoundIds.has(sound.id)
      ? Array.from(selectedSoundIds)
      : [sound.id]
    e.dataTransfer.setData('text/plain', soundIdsToMove.join(','))
  }

  const handleSoundDragEnd = () => {
    setDraggedSoundId(null)
    setDragOverCategoryId(null)
  }

  const handleCategoryDragOver = (
    e: DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedSoundId !== null) {
      setDragOverCategoryId(categoryId)
    }
  }

  const handleCategoryDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCategoryId(null)
  }

  const handleCategoryDrop = async (
    e: DragEvent<HTMLDivElement>,
    targetCategoryId: number | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCategoryId(null)

    if (draggedSoundId === null) return

    const newCategoryId =
      targetCategoryId === UNASSIGNED_CATEGORY_ID ? null : targetCategoryId

    const soundIdsToMove = selectedSoundIds.has(draggedSoundId)
      ? Array.from(selectedSoundIds)
      : [draggedSoundId]

    const soundsToMove = sounds.filter(
      s => soundIdsToMove.includes(s.id) && s.categoryId !== newCategoryId
    )

    if (soundsToMove.length === 0) {
      setDraggedSoundId(null)
      return
    }

    moveSoundsToCategoryMutation.mutate({
      soundIds: soundsToMove.map(s => s.id),
      categoryId: newCategoryId,
    })

    setDraggedSoundId(null)
  }

  // Handle recycling sounds via context menu
  const handleRecycleSounds = async () => {
    const soundIdsToRecycle =
      selectedSoundIds.size > 0
        ? Array.from(selectedSoundIds)
        : contextMenuTarget
          ? [contextMenuTarget.id]
          : []

    if (soundIdsToRecycle.length === 0) return

    recycleSoundsMutation.mutate(soundIdsToRecycle)
  }

  // Handle "Show in Folder" from context menu
  const handleShowInFolder = async () => {
    // For unassigned sounds, show root Sounds folder
    // For categorized sounds, show the category folder
    let virtualPath = 'Sounds'
    if (
      activeCategoryId !== null &&
      activeCategoryId !== UNASSIGNED_CATEGORY_ID
    ) {
      const category = categories.find(c => c.id === activeCategoryId)
      if (category) {
        virtualPath = `Sounds/${category.name}`
      }
    }

    const result = await openInFileExplorer(virtualPath)
    showToast({
      severity: result.success ? 'info' : 'warn',
      summary: result.success ? 'Opening' : 'Note',
      detail: result.message,
      life: 4000,
    })
  }

  // Handle "Copy Path" from context menu
  const handleCopyPath = async () => {
    // For unassigned sounds, copy path to root Sounds folder
    // For categorized sounds, copy path to the category folder
    let virtualPath = 'Sounds'
    if (
      activeCategoryId !== null &&
      activeCategoryId !== UNASSIGNED_CATEGORY_ID
    ) {
      const category = categories.find(c => c.id === activeCategoryId)
      if (category) {
        virtualPath = `Sounds/${category.name}`
      }
    }

    const result = await copyPathToClipboard(virtualPath)

    showToast({
      severity: result.success ? 'success' : 'error',
      summary: result.success ? 'Copied' : 'Failed',
      detail: result.success
        ? getCopyPathSuccessMessage()
        : 'Failed to copy path to clipboard',
      life: 5000,
    })
  }

  // Handle right-click on sound card
  const handleSoundContextMenu = (
    e: React.MouseEvent<HTMLDivElement>,
    sound: SoundDto
  ) => {
    e.preventDefault()
    // Right-click only targets the card for the menu; it does not change the
    // checkbox selection. Menu actions fall back to this target when nothing
    // is explicitly selected (see handleRecycleSounds).
    setContextMenuTarget(sound)
    contextMenuRef.current?.show(e)
  }

  return (
    <div
      className="sound-list"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />
      <SoundContextMenu
        contextMenuRef={contextMenuRef}
        selectedCount={selectedSoundIds.size}
        onShowInFolder={handleShowInFolder}
        onCopyPath={handleCopyPath}
        onRecycle={handleRecycleSounds}
      />

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
              ariaControls="sound-list-search-panel"
            />
            <ListToolbarButton
              icon="pi pi-sliders-h"
              label="Filters"
              active={isFiltersOpen || hasActiveDurationFilter}
              onClick={() => setIsFiltersOpen(open => !open)}
              ariaLabel="Filters"
              ariaExpanded={isFiltersOpen}
              ariaControls="sound-list-filters-panel"
              badge={hasActiveDurationFilter ? 1 : undefined}
            />
            <OptionsButton
              cardWidth={cardWidth}
              minCardWidth={200}
              maxCardWidth={500}
              onCardWidthChange={width => setCardWidth('sounds', width)}
              showThumbnailAnimation={false}
            />
            <ListToolbarButton
              icon="pi pi-refresh"
              label="Refresh"
              onClick={() => void invalidateSounds()}
              tooltip="Refresh list"
              ariaLabel="Refresh"
            />
            <ListToolbarButton
              icon="pi pi-plus"
              label="Add Category"
              onClick={openCreateCategoryDialog}
              tooltip="Add a sound category"
              ariaLabel="Add Category"
            />
          </ListToolbarActions>

          <ListToolbarCount
            icon="pi pi-volume-up"
            count={filteredSounds.length}
            unitLabel="sound"
          />
        </ListToolbarRow>

        {selectedSoundIds.size > 0 ? (
          <ListToolbarSelectionBar>
            <ListToolbarSelectionSummary>
              {selectedSoundIds.size} sound
              {selectedSoundIds.size === 1 ? '' : 's'} selected.
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

        <ListToolbarPanel id="sound-list-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search sounds..."
          />
        </ListToolbarPanel>

        <ListToolbarPanel id="sound-list-filters-panel" open={isFiltersOpen}>
          <div className="list-filters-row">
            <div
              className="list-filters-switch"
              data-testid="sound-duration-filter"
            >
              <span>Duration (s)</span>
              <InputNumber
                value={minDuration}
                onValueChange={e => setMinDuration(e.value ?? null)}
                placeholder="Min"
                min={0}
                data-testid="min-duration-filter"
              />
              <span>–</span>
              <InputNumber
                value={maxDuration}
                onValueChange={e => setMaxDuration(e.value ?? null)}
                placeholder="Max"
                min={0}
                data-testid="max-duration-filter"
              />
            </div>
            {hasActiveDurationFilter ? (
              <Button
                icon="pi pi-times"
                className="p-button-text p-button-sm list-filters-clear"
                aria-label="Clear duration filter"
                tooltip="Clear duration filter"
                tooltipOptions={{ position: 'bottom' }}
                onClick={() => {
                  setMinDuration(null)
                  setMaxDuration(null)
                }}
              />
            ) : null}
          </div>
        </ListToolbarPanel>
      </ListToolbar>

      <SoundCategoryTabs
        categories={categories}
        sounds={sounds}
        activeCategoryId={activeCategoryId}
        dragOverCategoryId={dragOverCategoryId}
        onCategoryChange={setActiveCategoryId}
        onCategoryDragOver={handleCategoryDragOver}
        onCategoryDragLeave={handleCategoryDragLeave}
        onCategoryDrop={handleCategoryDrop}
        onEditCategory={openEditCategoryDialog}
        onDeleteCategory={handleDeleteCategory}
      />

      {loading ? (
        <div className="sound-list-loading">
          <ProgressSpinner />
        </div>
      ) : (
        <SoundGridContent
          filteredSounds={filteredSounds}
          cardWidth={cardWidth}
          selectedSoundIds={selectedSoundIds}
          draggedSoundId={draggedSoundId}
          soundGridRef={soundGridRef}
          isAreaSelecting={isAreaSelecting}
          selectionBox={selectionBox}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          totalCount={totalCount}
          totalSoundsCount={sounds.length}
          onToggleSelection={toggleSoundSelection}
          onSoundClick={openSoundModal}
          onContextMenu={handleSoundContextMenu}
          onSoundDragStart={handleSoundDragStart}
          onSoundDragEnd={handleSoundDragEnd}
          onGridMouseDown={handleGridMouseDown}
          onGridMouseMove={handleGridMouseMove}
          onGridMouseUp={handleGridMouseUp}
          onLoadMore={() => fetchNextPage()}
        />
      )}

      <div className="sound-drop-overlay">
        <i className="pi pi-upload" />
        <span>Drop audio files here</span>
      </div>

      <SoundCategoryDialog
        visible={showCategoryDialog}
        isEditing={editingCategory !== null}
        onHide={() => setShowCategoryDialog(false)}
        onSave={handleSaveCategory}
        registerCategory={registerCategory}
      />

      {/* Sound Editor Modal */}
      <Dialog
        visible={showSoundModal}
        onHide={() => setShowSoundModal(false)}
        style={{ width: '800px' }}
        className="sound-editor-modal"
        header={null}
        closable={false}
        contentStyle={{ padding: 0 }}
      >
        {selectedSound && (
          <SoundEditor
            sound={selectedSound}
            onClose={() => setShowSoundModal(false)}
            onDownload={handleDownload}
            onSoundUpdated={(soundId, name) => {
              setSelectedSound(prev =>
                prev && prev.id === soundId ? { ...prev, name } : prev
              )
              invalidateSounds()
            }}
          />
        )}
      </Dialog>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="audio/*"
        onChange={e => {
          if (e.target.files) {
            handleFileDrop(e.target.files)
          }
        }}
      />
    </div>
  )
}
