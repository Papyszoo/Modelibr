import { useState } from 'react'
import { Chip } from 'primereact/chip'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Button } from 'primereact/button'
import { getModelFileFormat, getFileExtension, formatFileSize } from '../../../utils/fileUtils'
// eslint-disable-next-line no-restricted-imports -- ModelInfo needs direct API access
import apiClient from '../../../services/ApiClient'
import TextureSetAssociationDialog from './TextureSetAssociationDialog'

function ModelInfo({ model, onModelUpdated }) {
  const [tags, setTags] = useState(
    model.tags ? model.tags.split(', ').filter(t => t.trim()) : []
  )
  const [description, setDescription] = useState(model.description || '')
  const [newTag, setNewTag] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showTextureSetDialog, setShowTextureSetDialog] = useState(false)

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const handleRemoveTag = tagToRemove => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleKeyPress = e => {
    if (e.key === 'Enter') {
      handleAddTag()
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const tagsString = tags.join(', ')
      await apiClient.updateModelTags(model.id, tagsString, description)
      // Success - could show a toast notification here
      if (onModelUpdated) {
        onModelUpdated()
      }
    } catch (error) {
      console.error('Failed to save tags:', error)
      // Could show error toast here
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveTextureSet = async (textureSetId: number) => {
    try {
      await apiClient.disassociateTextureSetFromModel(
        textureSetId,
        parseInt(model.id)
      )
      if (onModelUpdated) {
        onModelUpdated()
      }
    } catch (error) {
      console.error('Failed to remove texture set:', error)
    }
  }

  const handleDownloadFile = (fileId: string) => {
    // Download the file using the API endpoint
    const downloadUrl = `/api/files/${fileId}/download`
    window.open(downloadUrl, '_blank')
  }

  return (
    <>
      <div className="info-section">
        <h3>Model Information</h3>
        <div className="info-grid">
          <div className="info-item">
            <label>ID:</label>
            <span>{model.id}</span>
          </div>
          <div className="info-item">
            <label>Name:</label>
            <span>{model.name}</span>
          </div>
          <div className="info-item">
            <label>Created:</label>
            <span>{new Date(model.createdAt).toLocaleString()}</span>
          </div>
          <div className="info-item">
            <label>Modified:</label>
            <span>{new Date(model.updatedAt).toLocaleString()}</span>
          </div>
          <div className="info-item">
            <label>Format:</label>
            <span>{getModelFileFormat(model)}</span>
          </div>
        </div>
      </div>

      <div className="info-section">
        <h3>Model Files</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {model.files && model.files.length > 0 ? (
            model.files.map((file, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  backgroundColor: '#f8fafc',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                    {file.originalFileName}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                    {getFileExtension(file.originalFileName).toUpperCase()} •{' '}
                    {formatFileSize(file.sizeBytes)}
                  </div>
                </div>
                <Button
                  icon="pi pi-download"
                  className="p-button-rounded p-button-text"
                  onClick={() => handleDownloadFile(file.id)}
                  tooltip="Download file"
                  tooltipOptions={{ position: 'left' }}
                />
              </div>
            ))
          ) : (
            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
              No files available
            </span>
          )}
        </div>
      </div>

      <div className="info-section">
        <h3>AI Classification</h3>

        <div className="tags-section" style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
            }}
          >
            Tags:
          </label>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              minHeight: '2rem',
            }}
          >
            {tags.length > 0 ? (
              tags.map((tag, index) => (
                <Chip
                  key={index}
                  label={tag}
                  removable
                  onRemove={() => handleRemoveTag(tag)}
                  style={{ background: '#3b82f6', color: 'white' }}
                />
              ))
            ) : (
              <span
                style={{
                  color: '#94a3b8',
                  fontStyle: 'italic',
                  alignSelf: 'center',
                }}
              >
                No tags yet
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <InputText
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add new tag..."
              style={{ flex: 1 }}
            />
            <Button
              label="Add"
              icon="pi pi-plus"
              onClick={handleAddTag}
              disabled={!newTag.trim()}
              size="small"
            />
          </div>
        </div>

        <div className="description-section" style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
            }}
          >
            Description:
          </label>
          <InputTextarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Enter description with confidence metrics..."
            rows={3}
            style={{ width: '100%' }}
          />
        </div>

        <Button
          label={isSaving ? 'Saving...' : 'Save Changes'}
          icon="pi pi-save"
          onClick={handleSave}
          disabled={isSaving}
          style={{ width: '100%' }}
        />
      </div>

      <div className="info-section">
        <h3>Linked Texture Sets</h3>
        <div className="texture-sets-section" style={{ marginBottom: '1rem' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              minHeight: '2rem',
            }}
          >
            {model.textureSets && model.textureSets.length > 0 ? (
              model.textureSets.map(textureSet => (
                <Chip
                  key={textureSet.id}
                  label={textureSet.name}
                  removable
                  onRemove={() => handleRemoveTextureSet(textureSet.id)}
                  icon="pi pi-image"
                  style={{ background: '#8b5cf6', color: 'white' }}
                />
              ))
            ) : (
              <span
                style={{
                  color: '#94a3b8',
                  fontStyle: 'italic',
                  alignSelf: 'center',
                }}
              >
                No texture sets linked
              </span>
            )}
          </div>
          <Button
            label="Link Texture Sets"
            icon="pi pi-link"
            onClick={() => setShowTextureSetDialog(true)}
            style={{ width: '100%' }}
            size="small"
          />
        </div>
      </div>

      <div className="info-section">
        <h3>Controls</h3>
        <ul className="controls-list">
          <li>
            <strong>Mouse:</strong> Rotate view
          </li>
          <li>
            <strong>Scroll:</strong> Zoom in/out
          </li>
          <li>
            <strong>Right-click + drag:</strong> Pan view
          </li>
        </ul>
      </div>

      {showTextureSetDialog && (
        <TextureSetAssociationDialog
          visible={showTextureSetDialog}
          model={model}
          onHide={() => setShowTextureSetDialog(false)}
          onAssociationsChanged={() => {
            setShowTextureSetDialog(false)
            if (onModelUpdated) {
              onModelUpdated()
            }
          }}
        />
      )}
    </>
  )
}

export default ModelInfo
