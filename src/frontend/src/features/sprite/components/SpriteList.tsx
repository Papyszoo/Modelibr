import { useState, useEffect, useCallback, useRef, DragEvent } from 'react'
import { Toast } from 'primereact/toast'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Dropdown } from 'primereact/dropdown'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { useDragAndDrop } from '../../../shared/hooks/useFileUpload'
import { useUploadProgress } from '../../../hooks/useUploadProgress'
import ApiClient from '../../../services/ApiClient'
import './SpriteList.css'

interface SpriteDto {
  id: number
  name: string
  fileId: number
  spriteType: number
  categoryId: number | null
  categoryName: string | null
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
}

interface SpriteCategoryDto {
  id: number
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

const UNASSIGNED_CATEGORY_ID = -1
const SPRITE_TYPE_STATIC = 1
const SPRITE_TYPE_GIF = 3

function SpriteList() {
  const [sprites, setSprites] = useState<SpriteDto[]>([])
  const [categories, setCategories] = useState<SpriteCategoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showSpriteModal, setShowSpriteModal] = useState(false)
  const [editingCategory, setEditingCategory] =
    useState<SpriteCategoryDto | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [selectedSprite, setSelectedSprite] = useState<SpriteDto | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    UNASSIGNED_CATEGORY_ID
  )
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(
    null
  )
  const [draggedSpriteId, setDraggedSpriteId] = useState<number | null>(null)
  const [modalDragOver, setModalDragOver] = useState(false)
  const toast = useRef<Toast>(null)
  const uploadProgressContext = useUploadProgress()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadSprites = useCallback(async () => {
    try {
      setLoading(true)
      const response = await ApiClient.getAllSprites()
      setSprites(response.sprites || [])
    } catch (error) {
      console.error('Failed to load sprites:', error)
      setSprites([])
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load sprites',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCategories = useCallback(async () => {
    try {
      const response = await ApiClient.getAllSpriteCategories()
      setCategories(response.categories || [])
    } catch (error) {
      console.error('Failed to load categories:', error)
      setCategories([])
    }
  }, [])

  useEffect(() => {
    loadSprites()
    loadCategories()
  }, [loadSprites, loadCategories])

  const handleFileDrop = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)

    const imageFiles = fileArray.filter(
      file =>
        file.type.startsWith('image/') ||
        /\.(png|jpg|jpeg|gif|webp|apng|bmp|svg)$/i.test(file.name)
    )

    if (imageFiles.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Invalid Files',
        detail: 'Please drop image files only',
        life: 3000,
      })
      return
    }

    const batchId = uploadProgressContext?.createBatch() || undefined
    const categoryIdToAssign =
      activeCategoryId === UNASSIGNED_CATEGORY_ID
        ? undefined
        : (activeCategoryId ?? undefined)

    for (const file of imageFiles) {
      let uploadId: string | null = null
      try {
        uploadId =
          uploadProgressContext?.addUpload(file, 'sprite', batchId) || null

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const fileName = file.name.replace(/\.[^/.]+$/, '')
        const result = await ApiClient.createSpriteWithFile(file, {
          name: fileName,
          spriteType:
            file.type === 'image/gif' ? SPRITE_TYPE_GIF : SPRITE_TYPE_STATIC,
          categoryId: categoryIdToAssign,
          batchId: batchId,
        })

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 100)
          uploadProgressContext.completeUpload(uploadId, {
            fileId: result.fileId,
            spriteId: result.spriteId,
          })
        }

        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `Sprite "${fileName}" created successfully`,
          life: 3000,
        })
      } catch (error) {
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error as Error)
        }

        console.error('Failed to create sprite from file:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to create sprite from ${file.name}`,
          life: 3000,
        })
      }
    }

    loadSprites()
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileDrop)

  const getSpriteTypeName = (type: number): string => {
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

  const openEditCategoryDialog = (category: SpriteCategoryDto) => {
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
        await ApiClient.updateSpriteCategory(
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
        const result = await ApiClient.createSpriteCategory(
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
      loadSprites()
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

  const handleDeleteCategory = (category: SpriteCategoryDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the category "${category.name}"? Sprites in this category will become unassigned.`,
      header: 'Delete Category',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await ApiClient.deleteSpriteCategory(category.id)
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
          loadSprites()
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

  const openSpriteModal = (sprite: SpriteDto) => {
    setSelectedSprite(sprite)
    setShowSpriteModal(true)
  }

  const handleDownload = async () => {
    if (!selectedSprite) return

    try {
      const url = ApiClient.getFileUrl(selectedSprite.fileId.toString())
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

  const handleModalFileDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setModalDragOver(false)

    if (!selectedSprite) return

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const file = files[0]
    if (
      !file.type.startsWith('image/') &&
      !/\.(png|jpg|jpeg|gif|webp|apng|bmp|svg)$/i.test(file.name)
    ) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Invalid File',
        detail: 'Please drop an image file',
        life: 3000,
      })
      return
    }

    try {
      const fileName = file.name.replace(/\.[^/.]+$/, '')
      await ApiClient.createSpriteWithFile(file, {
        name: `${selectedSprite.name}_${fileName}`,
        spriteType:
          file.type === 'image/gif' ? SPRITE_TYPE_GIF : SPRITE_TYPE_STATIC,
        categoryId: selectedSprite.categoryId ?? undefined,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'New sprite size uploaded successfully',
        life: 3000,
      })
      loadSprites()
    } catch (error) {
      console.error('Failed to upload new sprite size:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload new sprite size',
        life: 3000,
      })
    }
  }

  const handleSpriteDragStart = (
    e: DragEvent<HTMLDivElement>,
    sprite: SpriteDto
  ) => {
    setDraggedSpriteId(sprite.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', sprite.id.toString())
  }

  const handleSpriteDragEnd = () => {
    setDraggedSpriteId(null)
    setDragOverCategoryId(null)
  }

  const handleCategoryDragOver = (
    e: DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedSpriteId !== null) {
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

    if (draggedSpriteId === null) return

    const sprite = sprites.find(s => s.id === draggedSpriteId)
    if (!sprite) return

    const newCategoryId =
      targetCategoryId === UNASSIGNED_CATEGORY_ID ? null : targetCategoryId

    if (sprite.categoryId === newCategoryId) {
      setDraggedSpriteId(null)
      return
    }

    try {
      await ApiClient.updateSprite(draggedSpriteId, {
        categoryId: newCategoryId,
      })
      const categoryName =
        newCategoryId === null
          ? 'Unassigned'
          : categories.find(c => c.id === newCategoryId)?.name ||
            'Unknown Category'
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Sprite moved to ${categoryName}`,
        life: 3000,
      })
      loadSprites()
    } catch (error) {
      console.error('Failed to update sprite category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update sprite category',
        life: 3000,
      })
    }

    setDraggedSpriteId(null)
  }

  const filteredSprites = sprites.filter(sprite => {
    if (activeCategoryId === UNASSIGNED_CATEGORY_ID) {
      return sprite.categoryId === null
    }
    return sprite.categoryId === activeCategoryId
  })

  if (loading) {
    return (
      <div className="sprite-list-loading">
        <ProgressSpinner />
      </div>
    )
  }

  return (
    <div
      className="sprite-list"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />
      <ConfirmDialog />

      <div className="sprite-list-header">
        <div className="sprite-list-title">
          <h2>Sprites</h2>
          <span className="sprite-count">{filteredSprites.length} sprites</span>
        </div>
        <div className="sprite-list-actions">
          <Button
            label="Add Category"
            icon="pi pi-plus"
            className="p-button-outlined"
            onClick={openCreateCategoryDialog}
          />
        </div>
      </div>

      <div className="sprite-category-tabs">
        <div
          className={`category-tab ${activeCategoryId === UNASSIGNED_CATEGORY_ID ? 'active' : ''} ${dragOverCategoryId === UNASSIGNED_CATEGORY_ID ? 'drag-over' : ''}`}
          onClick={() => setActiveCategoryId(UNASSIGNED_CATEGORY_ID)}
          onDragOver={e => handleCategoryDragOver(e, UNASSIGNED_CATEGORY_ID)}
          onDragLeave={handleCategoryDragLeave}
          onDrop={e => handleCategoryDrop(e, UNASSIGNED_CATEGORY_ID)}
        >
          <span>Unassigned</span>
          <span className="category-count">
            ({sprites.filter(s => s.categoryId === null).length})
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
              ({sprites.filter(s => s.categoryId === category.id).length})
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

      {filteredSprites.length === 0 ? (
        <div className="sprite-list-empty">
          <i
            className="pi pi-image"
            style={{ fontSize: '3rem', marginBottom: '1rem' }}
          />
          <p>No sprites in this category</p>
          <p className="hint">Drag and drop image files here to upload</p>
        </div>
      ) : (
        <div className="sprite-grid">
          {filteredSprites.map(sprite => (
            <div
              key={sprite.id}
              className={`sprite-card ${draggedSpriteId === sprite.id ? 'dragging' : ''}`}
              onClick={() => openSpriteModal(sprite)}
              draggable
              onDragStart={e => handleSpriteDragStart(e, sprite)}
              onDragEnd={handleSpriteDragEnd}
            >
              <div className="sprite-preview">
                <img
                  src={ApiClient.getFileUrl(sprite.fileId.toString())}
                  alt={sprite.name}
                  onError={e => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
              </div>
              <div className="sprite-info">
                <h3 className="sprite-name">{sprite.name}</h3>
                <div className="sprite-meta">
                  <span className="sprite-type">
                    {getSpriteTypeName(sprite.spriteType)}
                  </span>
                </div>
                <span className="sprite-size">
                  {formatFileSize(sprite.fileSizeBytes)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sprite-drop-overlay">
        <i className="pi pi-upload" />
        <span>Drop images here</span>
      </div>

      {/* Create/Edit Category Dialog */}
      <Dialog
        header={editingCategory ? 'Rename Category' : 'Add Category'}
        visible={showCategoryDialog}
        onHide={() => setShowCategoryDialog(false)}
        style={{ width: '400px' }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => setShowCategoryDialog(false)}
            />
            <Button
              label="Save"
              icon="pi pi-check"
              onClick={handleSaveCategory}
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
            />
          </div>
          <div className="field">
            <label htmlFor="categoryDescription">Description</label>
            <InputTextarea
              id="categoryDescription"
              value={categoryDescription}
              onChange={e => setCategoryDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </Dialog>

      {/* Sprite Detail Modal */}
      <Dialog
        header={selectedSprite?.name || 'Sprite'}
        visible={showSpriteModal}
        onHide={() => setShowSpriteModal(false)}
        style={{ width: '600px' }}
        className="sprite-detail-modal"
      >
        {selectedSprite && (
          <div
            className={`sprite-modal-content ${modalDragOver ? 'drag-over' : ''}`}
            onDrop={handleModalFileDrop}
            onDragOver={e => {
              e.preventDefault()
              setModalDragOver(true)
            }}
            onDragEnter={e => {
              e.preventDefault()
              setModalDragOver(true)
            }}
            onDragLeave={e => {
              e.preventDefault()
              setModalDragOver(false)
            }}
          >
            <div className="sprite-modal-preview">
              <img
                src={ApiClient.getFileUrl(selectedSprite.fileId.toString())}
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
              <div className="sprite-modal-upload-hint">
                <i className="pi pi-upload" />
                <span>Drop image here to upload a different sprite size</span>
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
            {modalDragOver && (
              <div className="sprite-modal-drop-overlay">
                <i className="pi pi-upload" />
                <span>Drop to upload new size</span>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={e => {
          if (e.target.files) {
            handleFileDrop(e.target.files)
          }
        }}
      />
    </div>
  )
}

export default SpriteList
