import { memo, useState, useRef, useEffect } from 'react'
import { Card } from 'primereact/card'
import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { Toast } from 'primereact/toast'
import { TextureType, TextureDto } from '@/types'
import {
  getTextureTypeInfo,
  getHeightModeOptions,
  HEIGHT_RELATED_TYPES,
} from '@/utils/textureTypeUtils'
import { useTextureSets } from '@/features/texture-set/hooks/useTextureSets'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { useGenericFileUpload } from '@/shared/hooks/useGenericFileUpload'
import './TextureCard.css'

interface HeightCardProps {
  /** All textures in the set - we'll find Height/Displacement/Bump from here */
  textures: TextureDto[]
  setId: number
  onTextureUpdated: () => void
}

/**
 * Special card for Height/Displacement/Bump texture types.
 * Only ONE of these can be assigned at a time (mutually exclusive).
 * Shows a mode dropdown to switch between the three types.
 */
export const HeightCard = memo(function HeightCard({
  textures,
  setId,
  onTextureUpdated,
}: HeightCardProps) {
  // Find which height-related texture exists (if any)
  const existingHeightTexture = textures.find(t =>
    HEIGHT_RELATED_TYPES.includes(t.textureType)
  )

  // Default mode to Height if nothing assigned, otherwise use existing
  const [selectedMode, setSelectedMode] = useState<TextureType>(
    existingHeightTexture?.textureType || TextureType.Height
  )
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [changingMode, setChangingMode] = useState(false)
  const toast = useRef<Toast>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textureSetsApi = useTextureSets()
  const { uploadFile } = useGenericFileUpload({ fileType: 'texture' })

  // Update selected mode when texture changes
  useEffect(() => {
    if (existingHeightTexture) {
      setSelectedMode(existingHeightTexture.textureType)
    }
  }, [existingHeightTexture])

  const typeInfo = getTextureTypeInfo(selectedMode)
  const modeOptions = getHeightModeOptions()

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return

    const file = files[0]

    // Validate it's an image
    if (!file.type.startsWith('image/')) {
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

      // Upload the file
      const uploadResult = await uploadFile(file)
      const fileId = uploadResult.fileId

      // Add it to the set with the selected mode/type
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

    // If there's an existing texture, change its type
    if (existingHeightTexture) {
      try {
        setChangingMode(true)
        await textureSetsApi.changeTextureType(
          setId,
          existingHeightTexture.id,
          newMode
        )
        toast.current?.show({
          severity: 'success',
          summary: 'Mode Changed',
          detail: `Changed from ${getTextureTypeInfo(existingHeightTexture.textureType)?.label} to ${getTextureTypeInfo(newMode)?.label}`,
          life: 3000,
        })
        onTextureUpdated()
      } catch (error) {
        console.error('Failed to change mode:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to change height mode',
          life: 3000,
        })
      } finally {
        setChangingMode(false)
      }
    } else {
      // No texture assigned yet, just change the default mode
      setSelectedMode(newMode)
    }
  }

  const handleRemove = async () => {
    if (!existingHeightTexture) return

    try {
      await textureSetsApi.removeTextureFromSet(setId, existingHeightTexture.id)
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
    if (!existingHeightTexture && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(Array.from(files))
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const cardClassName = `texture-card height-card ${isDragging ? 'dragging' : ''} ${existingHeightTexture ? 'has-texture' : 'empty'}`

  // Mode dropdown item template
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
        { '--card-accent': typeInfo?.color || '#8b5cf6' } as React.CSSProperties
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
        accept="image/*"
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
            data-testid="height-mode-dropdown"
          />
        </div>
        {existingHeightTexture && (
          <Button
            icon="pi pi-times"
            className="p-button-text p-button-rounded p-button-danger texture-remove-btn"
            onClick={e => {
              e.stopPropagation()
              handleRemove()
            }}
            tooltip="Remove texture"
          />
        )}
      </div>

      <div className="texture-card-content">
        {existingHeightTexture ? (
          <div className="texture-preview">
            <img
              src={`/api/files/${existingHeightTexture.fileId}/data`}
              alt={typeInfo?.label}
              className="texture-image"
            />
          </div>
        ) : (
          <div className="texture-placeholder">
            <i className={`pi ${typeInfo?.icon || 'pi-chart-line'}`} />
            <span>{uploading ? 'Uploading...' : 'Drop or click to add'}</span>
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
