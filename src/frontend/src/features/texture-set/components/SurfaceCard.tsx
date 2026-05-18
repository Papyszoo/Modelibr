import './TextureCard.css'

import { Button } from 'primereact/button'
import { Card } from 'primereact/card'
import { Dropdown } from 'primereact/dropdown'
import { Toast } from 'primereact/toast'
import { memo, useEffect, useRef, useState } from 'react'

import { getFilePreviewUrl } from '@/features/models/api/modelApi'
import { useTextureSets } from '@/features/texture-set/hooks/useTextureSets'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { useGenericFileUpload } from '@/shared/hooks/useGenericFileUpload'
import { type TextureDto, TextureType } from '@/types'
import {
  getSurfaceModeOptions,
  getTextureTypeInfo,
  SURFACE_RELATED_TYPES,
} from '@/utils/textureTypeUtils'

import { TexturePreview } from './TexturePreview'

interface SurfaceCardProps {
  /** All textures in the set - we'll find Roughness/Glossiness from here */
  textures: TextureDto[]
  setId: number
  onTextureUpdated: () => void
}

/**
 * Special card for Roughness/Glossiness texture types.
 * They describe the same surface property (microsurface), inverted —
 * only ONE can be assigned at a time. Glossiness is inverted at load time
 * and fed into Three's roughnessMap slot.
 */
export const SurfaceCard = memo(function SurfaceCard({
  textures,
  setId,
  onTextureUpdated,
}: SurfaceCardProps) {
  const existingSurfaceTexture = textures.find(t =>
    SURFACE_RELATED_TYPES.includes(t.textureType)
  )

  const [selectedMode, setSelectedMode] = useState<TextureType>(
    existingSurfaceTexture?.textureType || TextureType.Roughness
  )
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [changingMode, setChangingMode] = useState(false)
  const toast = useRef<Toast>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textureSetsApi = useTextureSets()
  const { uploadFile } = useGenericFileUpload({ fileType: 'texture' })

  useEffect(() => {
    if (existingSurfaceTexture) {
      setSelectedMode(existingSurfaceTexture.textureType)
    }
  }, [existingSurfaceTexture])

  const typeInfo = getTextureTypeInfo(selectedMode)
  const modeOptions = getSurfaceModeOptions()

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return

    const file = files[0]

    const ext = file.name.toLowerCase().split('.').pop()
    const isImage =
      file.type.startsWith('image/') ||
      ['exr', 'tga', 'bmp'].includes(ext || '')
    if (!isImage) {
      toast.current?.show({
        severity: 'error',
        summary: 'Invalid File',
        detail: 'Please upload an image file',
        life: 3000,
      })
      return
    }

    try {
      setUploading(true)

      const uploadResult = await uploadFile(file)
      const fileId = uploadResult.fileId

      await textureSetsApi.addTextureToSetEndpoint(setId, {
        fileId: fileId,
        textureType: selectedMode,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${typeInfo?.label} texture uploaded successfully`,
        life: 3000,
      })

      onTextureUpdated()
    } catch (error) {
      console.error('Failed to upload texture:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload texture',
        life: 3000,
      })
    } finally {
      setUploading(false)
    }
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileUpload)

  const handleDragEnter = (e: React.DragEvent) => {
    onDragEnter(e)
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    onDragLeave(e)
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    onDrop(e)
    setIsDragging(false)
  }

  const handleModeChange = async (newMode: TextureType) => {
    if (newMode === selectedMode) return

    if (existingSurfaceTexture) {
      try {
        setChangingMode(true)
        await textureSetsApi.changeTextureType(
          setId,
          existingSurfaceTexture.id,
          newMode
        )
        toast.current?.show({
          severity: 'success',
          summary: 'Mode Changed',
          detail: `Changed from ${getTextureTypeInfo(existingSurfaceTexture.textureType)?.label} to ${getTextureTypeInfo(newMode)?.label}`,
          life: 3000,
        })
        onTextureUpdated()
      } catch (error) {
        console.error('Failed to change mode:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to change surface mode',
          life: 3000,
        })
      } finally {
        setChangingMode(false)
      }
    } else {
      setSelectedMode(newMode)
    }
  }

  const handleRemove = async () => {
    if (!existingSurfaceTexture) return

    try {
      await textureSetsApi.removeTextureFromSet(
        setId,
        existingSurfaceTexture.id
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture removed',
        life: 3000,
      })
      onTextureUpdated()
    } catch (error) {
      console.error('Failed to remove texture:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to remove texture',
        life: 3000,
      })
    }
  }

  const handleClick = () => {
    if (!existingSurfaceTexture && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(Array.from(files))
    }
    e.target.value = ''
  }

  const cardClassName = `texture-card surface-card ${isDragging ? 'dragging' : ''} ${existingSurfaceTexture ? 'has-texture' : 'empty'}`

  const modeOptionTemplate = (option: {
    label: string
    color: string
    icon: string
  }) => {
    if (!option) return null
    return (
      <div className="height-mode-option">
        <i className={`pi ${option.icon}`} style={{ color: option.color }} />
        <span>{option.label}</span>
      </div>
    )
  }

  return (
    <Card
      className={cardClassName}
      style={
        { '--card-accent': typeInfo?.color || '#f59e0b' } as React.CSSProperties
      }
      onClick={handleClick}
      onDragOver={onDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toast ref={toast} />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/*,.exr,.tga,.bmp,.tif,.tiff"
        style={{ display: 'none' }}
      />

      <div className="texture-card-header">
        <div
          className="height-mode-selector"
          onClick={e => e.stopPropagation()}
        >
          <Dropdown
            value={selectedMode}
            options={modeOptions}
            optionLabel="label"
            optionValue="value"
            onChange={e => handleModeChange(e.value)}
            disabled={changingMode}
            className="height-mode-dropdown"
            itemTemplate={modeOptionTemplate}
            valueTemplate={modeOptionTemplate}
            data-testid="surface-mode-dropdown"
          />
        </div>
      </div>

      <div className="texture-card-content">
        {existingSurfaceTexture ? (
          <div className="texture-card-with-preview">
            <TexturePreview
              src={getFilePreviewUrl(existingSurfaceTexture.fileId.toString())}
              alt={typeInfo?.label || 'Roughness'}
              fileName={existingSurfaceTexture.fileName}
              className="texture-preview-image"
            />
            <div className="texture-card-overlay">
              <div className="texture-overlay-top">
                <Button
                  icon="pi pi-trash"
                  className="p-button-rounded p-button-text p-button-danger texture-icon-btn"
                  onClick={e => {
                    e.stopPropagation()
                    handleRemove()
                  }}
                  disabled={uploading}
                  aria-label="Remove texture"
                />
              </div>
              <div className="texture-overlay-center">
                <Button
                  icon="pi pi-upload"
                  className="p-button-rounded p-button-lg texture-upload-btn"
                  onClick={e => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                  disabled={uploading}
                  aria-label="Replace texture"
                />
              </div>
              <div className="texture-overlay-bottom">
                <span className="texture-overlay-filename">
                  {existingSurfaceTexture.fileName}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="texture-card-empty" onClick={handleClick}>
            <i
              className="pi pi-cloud-upload"
              style={{ fontSize: '3rem', color: '#94a3b8' }}
            ></i>
            <p className="drop-text">Drop image here or click to browse</p>
          </div>
        )}
      </div>

      {isDragging && (
        <div className="texture-drop-overlay">
          <i className="pi pi-upload" />
          <span>Drop to upload</span>
        </div>
      )}
    </Card>
  )
})
