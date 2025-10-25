import { useState, useEffect } from 'react'
import FloatingWindow from '../../../components/FloatingWindow'
import { Model } from '../../../utils/fileUtils'
import { ModelVersionDto } from '../../../types'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import { Button } from 'primereact/button'
import './ModelVersionWindow.css'

interface ModelVersionWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  model: Model | null
  onVersionSelect?: (version: ModelVersionDto) => void
  onDefaultFileChange?: (fileId: number) => void
}

function ModelVersionWindow({
  visible,
  onClose,
  side = 'left',
  model,
  onVersionSelect,
  onDefaultFileChange,
}: ModelVersionWindowProps) {
  const [versions, setVersions] = useState<ModelVersionDto[]>([])
  const [selectedVersion, setSelectedVersion] = useState<ModelVersionDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [defaultFileId, setDefaultFileId] = useState<number | null>(null)
  const [draggedVersionId, setDraggedVersionId] = useState<number | null>(null)

  // Load default file preference from localStorage
  useEffect(() => {
    if (model) {
      const stored = localStorage.getItem(`model-${model.id}-default-file`)
      if (stored) {
        setDefaultFileId(parseInt(stored))
      }
    }
  }, [model])

  useEffect(() => {
    if (visible && model) {
      loadVersions()
    }
  }, [visible, model])

  const loadVersions = async () => {
    if (!model) return
    
    try {
      setLoading(true)
      const data = await ApiClient.getModelVersions(parseInt(model.id))
      setVersions(data)
      // Select the latest version by default
      if (data.length > 0) {
        const latestVersion = data[data.length - 1]
        setSelectedVersion(latestVersion)
        if (onVersionSelect) {
          onVersionSelect(latestVersion)
        }

        // Auto-set first renderable file as default if no default is set
        const stored = localStorage.getItem(`model-${model.id}-default-file`)
        if (!stored && latestVersion.files.length > 0) {
          const firstRenderableFile = latestVersion.files.find(f => f.isRenderable)
          if (firstRenderableFile) {
            setDefaultFileId(firstRenderableFile.id)
            localStorage.setItem(`model-${model.id}-default-file`, firstRenderableFile.id.toString())
            if (onDefaultFileChange) {
              onDefaultFileChange(firstRenderableFile.id)
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load versions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleVersionSelect = (version: ModelVersionDto) => {
    setSelectedVersion(version)
    if (onVersionSelect) {
      onVersionSelect(version)
    }
  }

  const handleDownloadFile = (fileId: number, fileName: string) => {
    if (!selectedVersion || !model) return
    const url = ApiClient.getVersionFileUrl(
      parseInt(model.id),
      selectedVersion.id,
      fileId
    )
    window.open(url, '_blank')
  }

  const handleOpenInBlender = (fileId: number, fileName: string) => {
    if (!selectedVersion || !model) return
    const url = ApiClient.getVersionFileUrl(
      parseInt(model.id),
      selectedVersion.id,
      fileId
    )
    // Try to open with blender:// protocol
    const blenderUrl = `blender://${url}`
    window.location.href = blenderUrl
  }

  const handleSetDefaultFile = (fileId: number) => {
    if (!model) return
    setDefaultFileId(fileId)
    localStorage.setItem(`model-${model.id}-default-file`, fileId.toString())
    if (onDefaultFileChange) {
      onDefaultFileChange(fileId)
    }
  }

  const handleDragStart = (versionId: number) => {
    setDraggedVersionId(versionId)
  }

  const handleDragOver = (e: React.DragEvent, targetVersionId: number) => {
    e.preventDefault()
    if (!draggedVersionId || draggedVersionId === targetVersionId) return

    const draggedIndex = versions.findIndex(v => v.id === draggedVersionId)
    const targetIndex = versions.findIndex(v => v.id === targetVersionId)
    
    if (draggedIndex === -1 || targetIndex === -1) return

    const newVersions = [...versions]
    const [draggedVersion] = newVersions.splice(draggedIndex, 1)
    newVersions.splice(targetIndex, 0, draggedVersion)
    
    setVersions(newVersions)
  }

  const handleDragEnd = async () => {
    if (!model || !draggedVersionId) {
      setDraggedVersionId(null)
      return
    }

    try {
      // Send new order to backend
      const versionIds = versions.map(v => v.id)
      await ApiClient.reorderModelVersions(parseInt(model.id), versionIds)
    } catch (error) {
      console.error('Failed to reorder versions:', error)
      // Reload versions to restore correct order
      await loadVersions()
    }

    setDraggedVersionId(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Model Versions"
      side={side}
      windowId="versions"
    >
      {!model ? (
        <p style={{ color: '#64748b', fontStyle: 'italic' }}>No model loaded</p>
      ) : loading ? (
        <p style={{ color: '#64748b', fontStyle: 'italic' }}>Loading versions...</p>
      ) : versions.length === 0 ? (
        <div style={{ color: '#64748b', fontStyle: 'italic', padding: '1rem 0' }}>
          No versions available. Upload files to create versions.
        </div>
      ) : (
        <div className="version-window-content">
          {/* Version List */}
          <div className="version-list">
            <h4>Select Version:</h4>
            {versions.map((version) => (
              <div
                key={version.id}
                className={`version-item ${selectedVersion?.id === version.id ? 'selected' : ''} ${draggedVersionId === version.id ? 'dragging' : ''}`}
                onClick={() => handleVersionSelect(version)}
                draggable
                onDragStart={() => handleDragStart(version.id)}
                onDragOver={(e) => handleDragOver(e, version.id)}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
              >
                <div className="version-header">
                  <span className="version-number">Version {version.versionNumber}</span>
                  {version.id === versions[versions.length - 1]?.id && (
                    <span className="latest-badge">Latest</span>
                  )}
                </div>
                {version.description && (
                  <div className="version-description">{version.description}</div>
                )}
                <div className="version-date">{formatDate(version.createdAt)}</div>
              </div>
            ))}
          </div>

          {/* Selected Version Files */}
          {selectedVersion && (
            <div className="version-files-section">
              <h4>Files in Version {selectedVersion.versionNumber}:</h4>
              <div className="file-list">
                {selectedVersion.files.map((file) => (
                  <div key={file.id} className="file-card">
                    <div className="file-info-section">
                      <div className="file-name">{file.originalFileName}</div>
                      <div className="file-meta">
                        <span className="file-type-badge">{file.fileType}</span>
                        <span className="file-size">{formatFileSize(file.sizeBytes)}</span>
                        {file.isRenderable && (
                          <span className="renderable-badge">Renderable</span>
                        )}
                        {file.isRenderable && file.id === defaultFileId && (
                          <span className="default-file-badge">Default Preview</span>
                        )}
                      </div>
                    </div>
                    <div className="file-actions">
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
                      {file.isRenderable && file.id !== defaultFileId && (
                        <Button
                          label="Set as Default"
                          icon="pi pi-star"
                          size="small"
                          outlined
                          onClick={() => handleSetDefaultFile(file.id)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </FloatingWindow>
  )
}

export default ModelVersionWindow
