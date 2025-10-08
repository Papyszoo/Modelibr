import { useState, useRef } from 'react'
import { Card } from 'primereact/card'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { Dialog } from 'primereact/dialog'
import { TextureType, TextureDto } from '../../../types'
import { getTextureTypeInfo } from '../../../utils/textureTypeUtils'
import { useTexturePacks } from '../../../hooks/useTexturePacks'
import { useDragAndDrop } from '../../../features/models'
// eslint-disable-next-line no-restricted-imports -- ApiClient needed for file operations
import ApiClient from '../../../services/ApiClient'
import './TextureCard.css'

interface TextureCardProps {
  textureType: TextureType
  texture: TextureDto | null
  packId: number
  onTextureUpdated: () => void
}

function TextureCard({
  textureType,
  texture,
  packId,
  onTextureUpdated,
}: TextureCardProps) {
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showInfoDialog, setShowInfoDialog] = useState(false)
  const toast = useRef<Toast>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const texturePacksApi = useTexturePacks()
  const typeInfo = getTextureTypeInfo(textureType)

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

      // Upload the file using the dedicated files endpoint
      const uploadResult = await ApiClient.uploadFile(file)
      const fileId = uploadResult.fileId

      // Then add it to the pack
      await texturePacksApi.addTextureToPackEndpoint(packId, {
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

  const handleRemoveTexture = async () => {
    if (!texture) return

    try {
      setUploading(true)
      await texturePacksApi.removeTextureFromPack(packId, texture.id)

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
        className={`texture-card ${isDragging ? 'dragging' : ''} ${texture ? 'has-texture' : 'empty'}`}
        onDrop={handleDrop}
        onDragOver={onDragOver}
        onDragEnter={handleDragEnter}
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
            <div className="texture-card-with-preview">
              <img
                src={ApiClient.getFileUrl(texture.fileId.toString())}
                alt={texture.fileName || typeInfo.label}
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
