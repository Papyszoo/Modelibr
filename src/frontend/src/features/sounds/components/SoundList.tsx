import './SoundList.css'
import '@/shared/components/FilterPanel.css'

import { Button } from 'primereact/button'
import { type ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import {
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import { useSoundListData } from '@/features/sounds/hooks/useSoundListData'
import { useSoundMutations } from '@/features/sounds/hooks/useSoundMutations'
import { useSoundUpload } from '@/features/sounds/hooks/useSoundUpload'
import { NumberInput } from '@/shared/components'
import { CategoryTreePanel } from '@/shared/components/categories/CategoryTreePanel'
import { LoadingState } from '@/shared/components/feedback'
import {
  ListSelectionBar,
  ListToolbar,
  ListToolbarActions,
  ListToolbarButton,
  ListToolbarCount,
  ListToolbarPanel,
  ListToolbarRow,
  ListToolbarSearchInput,
  OptionsButton,
} from '@/shared/components/list-toolbar'
import { useGridAreaSelection, useListSelection } from '@/shared/hooks'
import {
  ALL_CATEGORIES_ID,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type SoundDto } from '@/types'
import {
  copyPathToClipboard,
  getCopyPathSuccessMessage,
  openInFileExplorer,
} from '@/utils/webdavUtils'

import { SoundContextMenu } from './SoundContextMenu'
import { SoundEditor } from './SoundEditor'
import { SoundGridContent } from './SoundGridContent'

export function SoundList() {
  const toast = useRef<Toast>(null)
  const contextMenuRef = useRef<ContextMenu>(null)

  const showToast = useCallback(
    (opts: {
      severity: string
      summary: string
      detail?: string
      life: number
      content?: () => ReactNode
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

  const [showSoundModal, setShowSoundModal] = useState(false)
  const [selectedSound, setSelectedSound] = useState<SoundDto | null>(null)
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(
    null
  )
  const [draggedSoundId, setDraggedSoundId] = useState<number | null>(null)
  const [selectedSoundIds, setSelectedSoundIds] = useState<Set<number>>(
    new Set()
  )
  const orderedSoundIds = useMemo(
    () => filteredSounds.map(sound => sound.id),
    [filteredSounds]
  )
  const selection = useListSelection({
    orderedIds: orderedSoundIds,
    selectedIds: selectedSoundIds,
    onChange: setSelectedSoundIds,
  })
  const {
    surfaceRef: soundGridRef,
    isAreaSelecting,
    selectionBox,
    surfaceProps: soundGridSurfaceProps,
  } = useGridAreaSelection<number>({
    cardSelector: '.sound-card[data-sound-id]',
    getCardId: card => {
      const raw = card.getAttribute('data-sound-id')
      if (!raw) return null
      const id = Number(raw)
      return Number.isNaN(id) ? null : id
    },
    onSelect: setSelectedSoundIds,
  })
  const [contextMenuTarget, setContextMenuTarget] = useState<SoundDto | null>(
    null
  )
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const hasActiveDurationFilter = minDuration != null || maxDuration != null

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.sounds

  const {
    createCategoryMutation,
    renameCategoryMutation,
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

  const toggleSoundSelection = (soundId: number, event: MouseEvent) => {
    event.stopPropagation()
    selection.toggle(soundId, event)
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
    // before `drop` - so `draggedSoundId` is null when
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

  // Open the same bulk menu a card right-click shows, anchored at the bar.
  const handleBulkActionsClick = (event: MouseEvent<HTMLElement>) => {
    contextMenuRef.current?.show(event)
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

  // Per-category counts for the sidebar tree (from the loaded sounds).
  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const sound of sounds) {
      if (sound.categoryId != null) {
        counts.set(sound.categoryId, (counts.get(sound.categoryId) ?? 0) + 1)
      }
    }
    return counts
  }, [sounds])
  const unassignedCount = useMemo(
    () => sounds.filter(s => s.categoryId == null).length,
    [sounds]
  )

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
      ref={selection.containerRef}
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
          </ListToolbarActions>

          <ListToolbarCount
            icon="pi pi-volume-up"
            count={filteredSounds.length}
            unitLabel="sound"
          />
        </ListToolbarRow>

        <ListSelectionBar
          count={selectedSoundIds.size}
          visibleCount={filteredSounds.length}
          unitLabel="sound"
          onBulkActionsClick={handleBulkActionsClick}
          onSelectAllClick={selection.selectAll}
          onDeselectAllClick={selection.deselectAll}
        />

        <ListToolbarPanel id="sound-list-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search sounds..."
            autoFocus={isSearchOpen}
          />
        </ListToolbarPanel>

        <ListToolbarPanel id="sound-list-filters-panel" open={isFiltersOpen}>
          <div className="list-filters-row">
            <div
              className="list-filters-switch"
              data-testid="sound-duration-filter"
            >
              <span>Duration (s)</span>
              <NumberInput
                value={minDuration}
                onChange={setMinDuration}
                placeholder="Min"
                min={0}
                allowEmpty
                data-testid="min-duration-filter"
              />
              <span>–</span>
              <NumberInput
                value={maxDuration}
                onChange={setMaxDuration}
                placeholder="Max"
                min={0}
                allowEmpty
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

      <div className="sound-list-body">
        <aside className="sound-category-sidebar">
          <CategoryTreePanel
            categories={categories}
            activeCategoryId={activeCategoryId}
            dragOverCategoryId={dragOverCategoryId}
            categoryCounts={categoryCounts}
            unassignedCount={unassignedCount}
            allCount={sounds.length}
            allCategoryId={ALL_CATEGORIES_ID}
            unassignedCategoryId={UNASSIGNED_CATEGORY_ID}
            unassignedLabel="Unassigned"
            itemNoun="sound"
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

        <div className="sound-list-main">
          {loading ? (
            <LoadingState
              className="sound-list-loading"
              message="Loading sounds…"
            />
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
              onGridMouseDown={soundGridSurfaceProps.onMouseDown}
              onGridMouseMove={soundGridSurfaceProps.onMouseMove}
              onGridMouseUp={soundGridSurfaceProps.onMouseUp}
              onLoadMore={() => fetchNextPage()}
            />
          )}
        </div>
      </div>

      <div className="sound-drop-overlay">
        <i className="pi pi-upload" />
        <span>Drop audio files here</span>
      </div>

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
