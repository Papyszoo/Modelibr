import { useState, useRef } from 'react'
import { Card } from 'primereact/card'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { Dialog } from 'primereact/dialog'
import { TextureType, TextureDto } from '../../../types'
import { getTextureTypeInfo } from '../../../utils/textureTypeUtils'
import { useTextureSets } from '../hooks/useTextureSets'
import { useDragAndDrop } from '../../../shared/hooks/useFileUpload'
import { useGenericFileUpload } from '../../../shared/hooks/useGenericFileUpload'
// eslint-disable-next-line no-restricted-imports -- ApiClient needed for file operations
import ApiClient from '../../../services/ApiClient'
import './TextureCard.css'
import TexturePreview from './TexturePreview'

interface TextureCardProps {
  textureType: TextureType
  texture: TextureDto | null
  setId: number
  onTextureUpdated: () => void
}

function TextureCard({
  textureType,
  texture,
  setId,
  onTextureUpdated,
}: TextureCardProps) {
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingTexture, setIsDraggingTexture] = useState(false)
  const [showInfoDialog, setShowInfoDialog] = useState(false)
  const toast = useRef<Toast>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textureSetsApi = useTextureSets()
  const typeInfo = getTextureTypeInfo(textureType)
  const { uploadFile } = useGenericFileUpload({ fileType: 'texture' })

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

      // Upload the file using the dedicated files endpoint with global progress
      const uploadResult = await uploadFile(file)
      const fileId = uploadResult.fileId

      // Then add it to the set
      await textureSetsApi.addTextureToSetEndpoint(setId, {
        fileId: fileId,
        textureType,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${typeInfo.label} texture ${texture ? 'replaced' : 'uploaded'} successfully`,
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

  // Enhance drag enter to set local dragging state
  const handleDragEnter = (e: React.DragEvent) => {
    onDragEnter(e)
    setIsDragging(true)
  }

  // Enhance drag leave to clear local dragging state
  const handleDragLeave = (e: React.DragEvent) => {
    onDragLeave(e)
    setIsDragging(false)
  }

  // Enhance drop to clear local dragging state
  const handleDrop = (e: React.DragEvent) => {
    onDrop(e)
    setIsDragging(false)
  }

  // Handle dragging a texture FROM this card to another
  const handleTextureDragStart = (e: React.DragEvent) => {
    if (!texture) return

    // Store texture data in drag event
    e.dataTransfer.setData(
      'texture',
      JSON.stringify({
        textureId: texture.id,
        textureType: texture.textureType,
        setId: setId,
      })
    )
    e.dataTransfer.effectAllowed = 'move'
    setIsDraggingTexture(true)
  }

  const handleTextureDragEnd = () => {
    setIsDraggingTexture(false)
  }

  // Handle texture being dragged over this card
  const handleTextureDragOver = (e: React.DragEvent) => {
    // Check if this is a texture drag (not a file drag)
    const hasTextureData = e.dataTransfer.types.includes('texture')

    if (hasTextureData) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    } else {
      // It's a file drag, use the normal handler
      onDragOver(e)
    }
  }

  const handleTextureDragEnterEnhanced = (e: React.DragEvent) => {
    const hasTextureData = e.dataTransfer.types.includes('texture')

    if (hasTextureData) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    } else {
      handleDragEnter(e)
    }
  }

  const handleTextureDropEnhanced = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const textureData = e.dataTransfer.getData('texture')

    if (textureData) {
      // This is a texture drop from another card
      setIsDragging(false)

      try {
        const draggedTexture = JSON.parse(textureData)

        // Don't do anything if dropping on the same texture type
        if (draggedTexture.textureType === textureType) {
          return
        }

        // Don't do anything if it's from a different set
        if (draggedTexture.setId !== setId) {
          toast.current?.show({
            severity: 'warn',
            summary: 'Not Allowed',
            detail: 'Cannot move textures between different texture sets',
            life: 3000,
          })
          return
        }

        setUploading(true)

        // Call the API to change texture type
        await textureSetsApi.changeTextureType(
          setId,
          draggedTexture.textureId,
          textureType
        )

        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `Texture type changed to ${typeInfo.label}`,
          life: 3000,
        })

        onTextureUpdated()
      } catch (error) {
        console.error('Failed to change texture type:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to change texture type',
          life: 3000,
        })
      } finally {
        setUploading(false)
      }
    } else {
      // This is a file drop, use the normal handler
      handleDrop(e)
    }
  }

  const handleRemoveTexture = async () => {
    if (!texture) return

    try {
      setUploading(true)
      await textureSetsApi.removeTextureFromSet(setId, texture.id)

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${typeInfo.label} texture removed`,
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
    } finally {
      setUploading(false)
    }
  }

  const handleCardClick = () => {
    fileInputRef.current?.click()
  }

  const handleReplaceClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    fileInputRef.current?.click()
  }

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowInfoDialog(true)
  }

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleRemoveTexture()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFileUpload(files)
    // Reset input
    e.target.value = ''
  }

  const cardTitle = (
    <div className="texture-card-title">
      <i
        className={`pi ${typeInfo.icon}`}
        style={{ color: typeInfo.color }}
      ></i>
      <span>{typeInfo.label}</span>
    </div>
  )

  return (
    <>
      <Toast ref={toast} />
      <Card
        title={cardTitle}
        className={`texture-card ${isDragging ? 'dragging' : ''} ${texture ? 'has-texture' : 'empty'} ${isDraggingTexture ? 'dragging-source' : ''}`}
        onDrop={handleTextureDropEnhanced}
        onDragOver={handleTextureDragOver}
        onDragEnter={handleTextureDragEnterEnhanced}
        onDragLeave={handleDragLeave}
        style={{ borderColor: typeInfo.color }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />

        <div className="texture-card-content">
          {uploading ? (
            <div className="texture-card-loading">
              <i
                className="pi pi-spin pi-spinner"
                style={{ fontSize: '2rem' }}
              ></i>
              <p>Uploading...</p>
            </div>
          ) : texture ? (
            <div
              className="texture-card-with-preview"
              draggable
              onDragStart={handleTextureDragStart}
              onDragEnd={handleTextureDragEnd}
            >
              <TexturePreview
                src={ApiClient.getFileUrl(texture.fileId.toString())}
                alt={texture.fileName || typeInfo.label}
                sourceChannel={texture.sourceChannel}
                className="texture-preview-image"
              />
              <div className="texture-card-overlay">
                <div className="texture-overlay-top">
                  <Button
                    icon="pi pi-info-circle"
                    className="p-button-rounded p-button-text texture-icon-btn"
                    onClick={handleInfoClick}
                    disabled={uploading}
                    aria-label="Texture info"
                  />
                  <Button
                    icon="pi pi-trash"
                    className="p-button-rounded p-button-text p-button-danger texture-icon-btn"
                    onClick={handleRemoveClick}
                    disabled={uploading}
                    aria-label="Remove texture"
                  />
                </div>
                <div className="texture-overlay-center">
                  <Button
                    icon="pi pi-upload"
                    className="p-button-rounded p-button-lg texture-upload-btn"
                    onClick={handleReplaceClick}
                    disabled={uploading}
                    aria-label="Replace texture"
                  />
                </div>
                <div className="texture-overlay-bottom">
                  <span className="texture-overlay-filename">
                    {texture.fileName}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="texture-card-empty" onClick={handleCardClick}>
              <i
                className="pi pi-cloud-upload"
                style={{ fontSize: '3rem', color: '#94a3b8' }}
              ></i>
              <p className="drop-text">Drop image here or click to browse</p>
              <p className="texture-description">{typeInfo.description}</p>
            </div>
          )}
        </div>
      </Card>

      {texture && (
        <Dialog
          header="Texture Information"
          visible={showInfoDialog}
          onHide={() => setShowInfoDialog(false)}
          style={{ width: '400px' }}
          modal
        >
          <div className="texture-info-dialog">
            <div className="texture-info-row">
              <strong>Type:</strong>
              <span>{typeInfo.label}</span>
            </div>
            <div className="texture-info-row">
              <strong>File Name:</strong>
              <span>{texture.fileName}</span>
            </div>
            <div className="texture-info-row">
              <strong>File ID:</strong>
              <span>{texture.fileId}</span>
            </div>
            <div className="texture-info-row">
              <strong>Added:</strong>
              <span>{new Date(texture.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

export default TextureCard
