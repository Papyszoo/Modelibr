import { useState, useEffect } from 'react'
import { Chip } from 'primereact/chip'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Button } from 'primereact/button'
import { getModelFileFormat } from '../../../utils/fileUtils'
// eslint-disable-next-line no-restricted-imports -- ModelInfo needs direct API access
import apiClient from '../../../services/ApiClient'
import TextureSetAssociationDialog from './TextureSetAssociationDialog'
import { ModelVersionDto } from '../../../types'

function ModelInfo({ model, onModelUpdated }) {
  const [versions, setVersions] = useState<ModelVersionDto[]>([])
  const [selectedVersion, setSelectedVersion] = useState<ModelVersionDto | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [tags, setTags] = useState(
    model.tags ? model.tags.split(', ').filter(t => t.trim()) : []
  )
  const [description, setDescription] = useState(model.description || '')
  const [newTag, setNewTag] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showTextureSetDialog, setShowTextureSetDialog] = useState(false)

  // Load versions when model changes
  useEffect(() => {
    loadVersions()
  }, [model.id])

  const loadVersions = async () => {
    try {
      setLoadingVersions(true)
      const data = await apiClient.getModelVersions(parseInt(model.id))
      setVersions(data)
      // Select the latest version by default
      if (data.length > 0) {
        setSelectedVersion(data[data.length - 1])
      }
    } catch (error) {
      console.error('Failed to load versions:', error)
    } finally {
      setLoadingVersions(false)
    }
  }

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

  const handleDownloadFile = (fileId: number, fileName: string) => {
    const url = apiClient.getVersionFileUrl(
      parseInt(model.id),
      selectedVersion!.id,
      fileId
    )
    window.open(url, '_blank')
  }

  const handleOpenInBlender = (fileId: number, fileName: string) => {
    const url = apiClient.getVersionFileUrl(
      parseInt(model.id),
      selectedVersion!.id,
      fileId
    )
    // Try to open with blender:// protocol
    const blenderUrl = `blender://${url}`
    window.location.href = blenderUrl
    
    // Also open download as fallback after a short delay
    setTimeout(() => {
      window.open(url, '_blank')
    }, 500)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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

      {/* Version Selection and Files Section */}
      <div className="info-section">
        <h3>Model Versions</h3>
        
        {loadingVersions ? (
          <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0' }}>
            Loading versions...
          </div>
        ) : versions.length > 0 ? (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: 500,
                }}
              >
                Select Version:
              </label>
              <select
                value={selectedVersion?.id || ''}
                onChange={(e) => {
                  const version = versions.find(v => v.id === parseInt(e.target.value))
                  setSelectedVersion(version || null)
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#1e293b',
                }}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.versionNumber}
                    {version.description ? ` - ${version.description}` : ''}
                    {version.id === versions[versions.length - 1]?.id ? ' (Latest)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedVersion && (
              <div>
                <h4 style={{ marginBottom: '0.75rem', color: '#1e293b' }}>
                  Files in Version {selectedVersion.versionNumber}:
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedVersion.files.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        padding: '0.75rem',
                      }}
                    >
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 500, color: '#1e293b' }}>
                          {file.originalFileName}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            background: '#e2e8f0',
                            borderRadius: '3px',
                            marginRight: '0.5rem',
                            textTransform: 'uppercase',
                            fontSize: '0.75rem',
                          }}>
                            {file.fileType}
                          </span>
                          {formatFileSize(file.sizeBytes)}
                          {file.isRenderable && (
                            <span style={{
                              display: 'inline-block',
                              marginLeft: '0.5rem',
                              padding: '2px 6px',
                              background: '#22c55e',
                              color: 'white',
                              borderRadius: '3px',
                              fontSize: '0.75rem',
                            }}>
                              Renderable
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button
                          label="Download"
                          icon="pi pi-download"
                          size="small"
                          onClick={() => handleDownloadFile(file.id, file.originalFileName)}
                        />
                        {file.fileType === 'blend' && (
                          <Button
                            label="Open in Blender"
                            icon="pi pi-external-link"
                            size="small"
                            severity="success"
                            onClick={() => handleOpenInBlender(file.id, file.originalFileName)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0' }}>
            No versions available. Upload files to create versions.
          </div>
        )}
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
