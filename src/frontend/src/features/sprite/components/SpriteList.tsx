import { useState, useEffect, useCallback, useRef } from 'react'
import { Toast } from 'primereact/toast'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Button } from 'primereact/button'
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

interface GetAllSpritesResponse {
  sprites: SpriteDto[]
}

function SpriteList() {
  const [sprites, setSprites] = useState<SpriteDto[]>([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    loadSprites()
  }, [loadSprites])

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

      <div className="sprite-list-header">
        <h2>Sprites</h2>
        <span className="sprite-count">{sprites.length} sprites</span>
      </div>

      {sprites.length === 0 ? (
        <div className="sprite-list-empty">
          <i className="pi pi-image" style={{ fontSize: '3rem', marginBottom: '1rem' }} />
          <p>No sprites found</p>
          <p className="hint">Drag and drop image files here to upload</p>
        </div>
      ) : (
        <div className="sprite-grid">
          {sprites.map(sprite => (
            <div key={sprite.id} className="sprite-card">
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
    </div>
  )
}

export default SpriteList
