import './SoundList.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { type ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
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
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
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
    if (!selectedSoundIds.has(sound.id)) {
      setSelectedSoundIds(new Set([sound.id]))
    }
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
    // If right-clicked sound is not in selection, select only that sound
    if (!selectedSoundIds.has(sound.id)) {
      setSelectedSoundIds(new Set([sound.id]))
    }
    setContextMenuTarget(sound)
    contextMenuRef.current?.show(e)
  }

  if (loading) {
    return (
      <div className="sound-list-loading">
        <ProgressSpinner />
      </div>
    )
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
      <ConfirmDialog />
      <SoundContextMenu
        contextMenuRef={contextMenuRef}
        selectedCount={selectedSoundIds.size}
        onShowInFolder={handleShowInFolder}
        onCopyPath={handleCopyPath}
        onRecycle={handleRecycleSounds}
      />

      <div className="sound-list-header">
        <div className="sound-list-title">
          <h2>Sounds</h2>
          <span className="sound-count">{filteredSounds.length} sounds</span>
          {selectedSoundIds.size > 0 && (
            <span className="selection-count">
              ({selectedSoundIds.size} selected)
              <Button
                icon="pi pi-times"
                className="p-button-text p-button-sm clear-selection-btn"
                onClick={clearSelection}
                tooltip="Clear selection"
              />
            </span>
          )}
        </div>
        <div className="sound-list-actions">
          <CardWidthSlider
            value={cardWidth}
            min={200}
            max={500}
            onChange={width => setCardWidth('sounds', width)}
          />
          <Button
            label="Add Category"
            icon="pi pi-plus"
            className="p-button-outlined"
            onClick={openCreateCategoryDialog}
          />
        </div>
      </div>

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
