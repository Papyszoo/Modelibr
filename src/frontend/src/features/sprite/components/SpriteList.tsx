import { useState, useEffect, useCallback, useRef } from 'react'
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

function SpriteList() {
  const [sprites, setSprites] = useState<SpriteDto[]>([])
  const [categories, setCategories] = useState<SpriteCategoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [editingCategory, setEditingCategory] = useState<SpriteCategoryDto | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [selectedSprite, setSelectedSprite] = useState<SpriteDto | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const toast = useRef<Toast>(null)
  const uploadProgressContext = useUploadProgress()

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

    // Filter to only image files
    const imageFiles = fileArray.filter(file =>
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

    // Create batch for all files
    const batchId = uploadProgressContext?.createBatch() || undefined

    for (const file of imageFiles) {
      let uploadId: string | null = null
      try {
        // Track the upload
        uploadId = uploadProgressContext?.addUpload(file, 'sprite', batchId) || null

        // Update progress
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        // Use the sprite upload endpoint
        const fileName = file.name.replace(/\.[^/.]+$/, '')
        const result = await ApiClient.createSpriteWithFile(file, {
          name: fileName,
          spriteType: file.type === 'image/gif' ? 3 : 1, // GIF = 3, Static = 1
          batchId: batchId,
        })

        // Complete the upload
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
        // Mark upload as failed
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

    // Refresh the sprites list
    loadSprites()
  }

  // Use drag and drop hook
  const { onDrop, onDragOver, onDragEnter, onDragLeave } = useDragAndDrop(handleFileDrop)

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

  // Category management
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
        await ApiClient.createSpriteCategory(
          categoryName.trim(),
          categoryDescription.trim() || undefined
        )
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Category created successfully',
          life: 3000,
        })
      }
      setShowCategoryDialog(false)
      loadCategories()
      loadSprites() // Refresh to update category names
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
      message: `Are you sure you want to delete the category "${category.name}"? Sprites in this category will become uncategorized.`,
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

  // Assign sprite to category
  const openAssignDialog = (sprite: SpriteDto) => {
    setSelectedSprite(sprite)
    setSelectedCategoryId(sprite.categoryId)
    setShowAssignDialog(true)
  }

  const handleAssignCategory = async () => {
    if (!selectedSprite) return

    try {
      await ApiClient.updateSprite(selectedSprite.id, {
        categoryId: selectedCategoryId,
      })
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Sprite category updated successfully',
        life: 3000,
      })
      setShowAssignDialog(false)
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
  }

  const categoryOptions = [
    { label: 'No Category', value: null },
    ...categories.map(cat => ({ label: cat.name, value: cat.id }))
  ]

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
          <span className="sprite-count">{sprites.length} sprites</span>
        </div>
        <div className="sprite-list-actions">
          <Button
            label="Manage Categories"
            icon="pi pi-folder"
            className="p-button-outlined"
            onClick={openCreateCategoryDialog}
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="sprite-categories-bar">
          {categories.map(category => (
            <div key={category.id} className="category-chip">
              <span>{category.name}</span>
              <Button
                icon="pi pi-pencil"
                className="p-button-text p-button-sm"
                onClick={() => openEditCategoryDialog(category)}
                tooltip="Edit category"
              />
              <Button
                icon="pi pi-trash"
                className="p-button-text p-button-sm p-button-danger"
                onClick={() => handleDeleteCategory(category)}
                tooltip="Delete category"
              />
            </div>
          ))}
        </div>
      )}

      {sprites.length === 0 ? (
        <div className="sprite-list-empty">
          <i className="pi pi-image" style={{ fontSize: '3rem', marginBottom: '1rem' }} />
          <p>No sprites found</p>
          <p className="hint">Drag and drop image files here to upload</p>
        </div>
      ) : (
        <div className="sprite-grid">
          {sprites.map(sprite => (
            <div key={sprite.id} className="sprite-card" onClick={() => openAssignDialog(sprite)}>
              <div className="sprite-preview">
                <img
                  src={ApiClient.getFileUrl(sprite.fileId.toString())}
                  alt={sprite.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <div className="sprite-info">
                <h3 className="sprite-name">{sprite.name}</h3>
                <div className="sprite-meta">
                  <span className="sprite-type">{getSpriteTypeName(sprite.spriteType)}</span>
                  {sprite.categoryName && (
                    <span className="sprite-category">{sprite.categoryName}</span>
                  )}
                </div>
                <span className="sprite-size">{formatFileSize(sprite.fileSizeBytes)}</span>
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
        header={editingCategory ? 'Edit Category' : 'Create Category'}
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
              onChange={(e) => setCategoryName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="categoryDescription">Description</label>
            <InputTextarea
              id="categoryDescription"
              value={categoryDescription}
              onChange={(e) => setCategoryDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </Dialog>

      {/* Assign Category Dialog */}
      <Dialog
        header={`Assign Category to "${selectedSprite?.name}"`}
        visible={showAssignDialog}
        onHide={() => setShowAssignDialog(false)}
        style={{ width: '400px' }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => setShowAssignDialog(false)}
            />
            <Button
              label="Save"
              icon="pi pi-check"
              onClick={handleAssignCategory}
            />
          </div>
        }
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="spriteCategory">Category</label>
            <Dropdown
              id="spriteCategory"
              value={selectedCategoryId}
              options={categoryOptions}
              onChange={(e) => setSelectedCategoryId(e.value)}
              placeholder="Select a category"
            />
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default SpriteList
