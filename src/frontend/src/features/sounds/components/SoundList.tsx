import {
  useState,
  useEffect,
  useCallback,
  useRef,
  DragEvent,
  MouseEvent,
} from 'react'
import { Toast } from 'primereact/toast'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { useDragAndDrop } from '../../../shared/hooks/useFileUpload'
import { useUploadProgress } from '../../../hooks/useUploadProgress'
import ApiClient from '../../../services/ApiClient'
import CardWidthSlider from '../../../shared/components/CardWidthSlider'
import { useCardWidthStore } from '../../../stores/cardWidthStore'
import { SoundDto, SoundCategoryDto } from '../../../types'
import { decodeAudio, extractPeaks, formatDuration } from '../../../utils/audioUtils'
import SoundCard from './SoundCard'
import SoundEditor from './SoundEditor'
import './SoundList.css'

const UNASSIGNED_CATEGORY_ID = -1

function SoundList() {
  const [sounds, setSounds] = useState<SoundDto[]>([])
  const [categories, setCategories] = useState<SoundCategoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showSoundModal, setShowSoundModal] = useState(false)
  const [editingCategory, setEditingCategory] =
    useState<SoundCategoryDto | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [selectedSound, setSelectedSound] = useState<SoundDto | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    UNASSIGNED_CATEGORY_ID
  )
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
  const soundGridRef = useRef<HTMLDivElement>(null)
  const toast = useRef<Toast>(null)
  const uploadProgressContext = useUploadProgress()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<ContextMenu>(null)
  const [contextMenuTarget, setContextMenuTarget] = useState<SoundDto | null>(
    null
  )

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.sounds

  const loadSounds = useCallback(async () => {
    try {
      setLoading(true)
      const response = await ApiClient.getAllSounds()
      setSounds(response.sounds || [])
    } catch (error) {
      console.error('Failed to load sounds:', error)
      setSounds([])
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load sounds',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCategories = useCallback(async () => {
    try {
      const response = await ApiClient.getAllSoundCategories()
      setCategories(response.categories || [])
    } catch (error) {
      console.error('Failed to load categories:', error)
      setCategories([])
    }
  }, [])

  useEffect(() => {
    loadSounds()
    loadCategories()
  }, [loadSounds, loadCategories])

  const handleFileDrop = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)

    const audioFiles = fileArray.filter(
      file =>
        file.type.startsWith('audio/') ||
        /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)
    )

    if (audioFiles.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Invalid Files',
        detail: 'Please drop audio files only',
        life: 3000,
      })
      return
    }

    const batchId = uploadProgressContext?.createBatch() || undefined
    const categoryIdToAssign =
      activeCategoryId === UNASSIGNED_CATEGORY_ID
        ? undefined
        : (activeCategoryId ?? undefined)

    for (const file of audioFiles) {
      let uploadId: string | null = null
      try {
        uploadId =
          uploadProgressContext?.addUpload(file, 'sound', batchId) || null

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 20)
        }

        // Decode audio to extract duration and peaks
        let duration = 0
        let peaks: string | undefined
        try {
          const audioBuffer = await decodeAudio(file)
          duration = audioBuffer.duration
          try {
            const peakData = extractPeaks(audioBuffer, 200)
            peaks = JSON.stringify(peakData)
          } catch (peakError) {
            console.warn('Could not extract peaks:', peakError)
          }
        } catch (decodeError) {
          console.warn('Could not decode audio for peaks, using defaults:', decodeError)
        }

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const fileName = file.name.replace(/\.[^/.]+$/, '')
        const result = await ApiClient.createSoundWithFile(file, {
          name: fileName,
          duration: duration,
          peaks: peaks,
          categoryId: categoryIdToAssign,
          batchId: batchId,
        })

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 100)
          uploadProgressContext.completeUpload(uploadId, {
            fileId: result.fileId,
            soundId: result.soundId,
          })
        }

        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `Sound "${fileName}" created successfully`,
          life: 3000,
        })
      } catch (error) {
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error as Error)
        }

        console.error('Failed to create sound from file:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to create sound from ${file.name}`,
          life: 3000,
        })
      }
    }

    loadSounds()
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileDrop)

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const openCreateCategoryDialog = () => {
    setEditingCategory(null)
    setCategoryName('')
    setCategoryDescription('')
    setShowCategoryDialog(true)
  }

  const openEditCategoryDialog = (category: SoundCategoryDto) => {
    setEditingCategory(category)
    setCategoryName(category.name)
    setCategoryDescription(category.description || '')
    setShowCategoryDialog(true)
  }

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation Error',
        detail: 'Category name is required',
        life: 3000,
      })
      return
    }

    try {
      if (editingCategory) {
        await ApiClient.updateSoundCategory(
          editingCategory.id,
          categoryName.trim(),
          categoryDescription.trim() || undefined
        )
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Category updated successfully',
          life: 3000,
        })
      } else {
        const result = await ApiClient.createSoundCategory(
          categoryName.trim(),
          categoryDescription.trim() || undefined
        )
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Category created successfully',
          life: 3000,
        })
        setActiveCategoryId(result.id)
      }
      setShowCategoryDialog(false)
      loadCategories()
      loadSounds()
    } catch (error) {
      console.error('Failed to save category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to save category',
        life: 3000,
      })
    }
  }

  const handleDeleteCategory = (category: SoundCategoryDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the category "${category.name}"? Sounds in this category will become unassigned.`,
      header: 'Delete Category',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await ApiClient.deleteSoundCategory(category.id)
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Category deleted successfully',
            life: 3000,
          })
          if (activeCategoryId === category.id) {
            setActiveCategoryId(UNASSIGNED_CATEGORY_ID)
          }
          loadCategories()
          loadSounds()
        } catch (error) {
          console.error('Failed to delete category:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete category',
            life: 3000,
          })
        }
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
      const url = ApiClient.getFileUrl(selectedSound.fileId.toString())
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
      toast.current?.show({
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

    try {
      await Promise.all(
        soundsToMove.map(sound =>
          ApiClient.updateSound(sound.id, { categoryId: newCategoryId })
        )
      )
      const targetCategoryName =
        newCategoryId === null
          ? 'Unassigned'
          : categories.find(c => c.id === newCategoryId)?.name ||
            'Unknown Category'
      const message =
        soundsToMove.length === 1
          ? `Sound moved to ${targetCategoryName}`
          : `${soundsToMove.length} sounds moved to ${targetCategoryName}`
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: message,
        life: 3000,
      })
      setSelectedSoundIds(new Set())
      loadSounds()
    } catch (error) {
      console.error('Failed to update sound category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update sound category',
        life: 3000,
      })
    }

    setDraggedSoundId(null)
  }

  const filteredSounds = sounds.filter(sound => {
    if (activeCategoryId === UNASSIGNED_CATEGORY_ID) {
      return sound.categoryId === null
    }
    return sound.categoryId === activeCategoryId
  })

  // Handle recycling sounds via context menu
  const handleRecycleSounds = async () => {
    const soundIdsToRecycle =
      selectedSoundIds.size > 0
        ? Array.from(selectedSoundIds)
        : contextMenuTarget
          ? [contextMenuTarget.id]
          : []

    if (soundIdsToRecycle.length === 0) return

    try {
      await Promise.all(
        soundIdsToRecycle.map(id => ApiClient.softDeleteSound(id))
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Recycled',
        detail:
          soundIdsToRecycle.length > 1
            ? `${soundIdsToRecycle.length} sounds moved to recycle bin`
            : 'Sound moved to recycle bin',
        life: 3000,
      })
      setSelectedSoundIds(new Set())
      setContextMenuTarget(null)
      loadSounds()
    } catch (error) {
      console.error('Failed to recycle sounds:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to recycle sounds',
        life: 3000,
      })
    }
  }

  // Get context menu items (dynamic label based on selection)
  const getContextMenuItems = (): MenuItem[] => {
    const selectedCount = selectedSoundIds.size
    const label =
      selectedCount > 1 ? `Recycle ${selectedCount} sounds` : 'Recycle'

    return [
      {
        label,
        icon: 'pi pi-trash',
        command: handleRecycleSounds,
      },
    ]
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
      <ContextMenu ref={contextMenuRef} model={getContextMenuItems()} />

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

      <div className="sound-category-tabs">
        <div
          className={`category-tab ${activeCategoryId === UNASSIGNED_CATEGORY_ID ? 'active' : ''} ${dragOverCategoryId === UNASSIGNED_CATEGORY_ID ? 'drag-over' : ''}`}
          onClick={() => setActiveCategoryId(UNASSIGNED_CATEGORY_ID)}
          onDragOver={e => handleCategoryDragOver(e, UNASSIGNED_CATEGORY_ID)}
          onDragLeave={handleCategoryDragLeave}
          onDrop={e => handleCategoryDrop(e, UNASSIGNED_CATEGORY_ID)}
        >
          <span>Unassigned</span>
          <span className="category-count">
            ({sounds.filter(s => s.categoryId === null).length})
          </span>
        </div>
        {categories.map(category => (
          <div
            key={category.id}
            className={`category-tab ${activeCategoryId === category.id ? 'active' : ''} ${dragOverCategoryId === category.id ? 'drag-over' : ''}`}
            onClick={() => setActiveCategoryId(category.id)}
            onDragOver={e => handleCategoryDragOver(e, category.id)}
            onDragLeave={handleCategoryDragLeave}
            onDrop={e => handleCategoryDrop(e, category.id)}
          >
            <span>{category.name}</span>
            <span className="category-count">
              ({sounds.filter(s => s.categoryId === category.id).length})
            </span>
            {activeCategoryId === category.id && (
              <div className="category-tab-actions">
                <Button
                  icon="pi pi-pencil"
                  className="p-button-text p-button-sm"
                  onClick={e => {
                    e.stopPropagation()
                    openEditCategoryDialog(category)
                  }}
                  tooltip="Rename category"
                />
                <Button
                  icon="pi pi-trash"
                  className="p-button-text p-button-sm p-button-danger"
                  onClick={e => {
                    e.stopPropagation()
                    handleDeleteCategory(category)
                  }}
                  tooltip="Delete category"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredSounds.length === 0 ? (
        <div className="sound-list-empty">
          <i
            className="pi pi-volume-up"
            style={{ fontSize: '3rem', marginBottom: '1rem' }}
          />
          <p>No sounds in this category</p>
          <p className="hint">Drag and drop audio files here to upload</p>
        </div>
      ) : (
        <div
          className="sound-grid-container"
          ref={soundGridRef}
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseUp={handleGridMouseUp}
          onMouseLeave={handleGridMouseUp}
        >
          <div
            className="sound-grid"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
            }}
          >
            {filteredSounds.map(sound => (
              <SoundCard
                key={sound.id}
                sound={sound}
                isSelected={selectedSoundIds.has(sound.id)}
                isDragging={draggedSoundId === sound.id}
                onSelect={e => toggleSoundSelection(sound.id, e)}
                onClick={() => openSoundModal(sound)}
                onContextMenu={e => handleSoundContextMenu(e, sound)}
                onDragStart={e => handleSoundDragStart(e, sound)}
                onDragEnd={handleSoundDragEnd}
              />
            ))}
          </div>
          {isAreaSelecting && selectionBox && (
            <div
              className="selection-box"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
              }}
            />
          )}
        </div>
      )}

      <div className="sound-drop-overlay">
        <i className="pi pi-upload" />
        <span>Drop audio files here</span>
      </div>

      {/* Create/Edit Category Dialog */}
      <Dialog
        header={editingCategory ? 'Rename Category' : 'Add Category'}
        visible={showCategoryDialog}
        onHide={() => setShowCategoryDialog(false)}
        style={{ width: '400px' }}
        data-testid="sound-category-dialog"
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => setShowCategoryDialog(false)}
              data-testid="sound-category-dialog-cancel"
            />
            <Button
              label="Save"
              icon="pi pi-check"
              onClick={handleSaveCategory}
              data-testid="sound-category-dialog-save"
            />
          </div>
        }
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="categoryName">Name *</label>
            <InputText
              id="categoryName"
              value={categoryName}
              onChange={e => setCategoryName(e.target.value)}
              autoFocus
              data-testid="sound-category-name-input"
            />
          </div>
          <div className="field">
            <label htmlFor="categoryDescription">Description</label>
            <InputTextarea
              id="categoryDescription"
              value={categoryDescription}
              onChange={e => setCategoryDescription(e.target.value)}
              rows={3}
              data-testid="sound-category-description-input"
            />
          </div>
        </div>
      </Dialog>

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

export default SoundList
