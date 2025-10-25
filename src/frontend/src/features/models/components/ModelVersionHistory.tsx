import React, { useEffect, useState } from 'react'
import { ModelVersionDto } from '../../../types'
import ApiClient from '../../../services/ApiClient'
import './ModelVersionHistory.css'

interface ModelVersionHistoryProps {
  modelId: number
  onClose: () => void
  onVersionSelect?: (version: ModelVersionDto) => void
}

export const ModelVersionHistory: React.FC<ModelVersionHistoryProps> = ({
  modelId,
  onClose,
  onVersionSelect,
}) => {
  const [versions, setVersions] = useState<ModelVersionDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadVersions()
  }, [modelId])

  const loadVersions = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getModelVersions(modelId)
      setVersions(data)
      setError(null)
    } catch (err) {
      setError('Failed to load model versions')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const description = prompt('Enter version description (optional):')

    try {
      setUploading(true)
      await ApiClient.createModelVersion(modelId, file, description || undefined)
      await loadVersions()
    } catch (err) {
      alert('Failed to create new version')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = (version: ModelVersionDto, file: any) => {
    const url = ApiClient.getVersionFileUrl(modelId, version.id, file.id)
    window.open(url, '_blank')
  }

  const handleOpenInBlender = (version: ModelVersionDto, file: any) => {
    const url = ApiClient.getVersionFileUrl(modelId, version.id, file.id)
    // Try to open with blender:// protocol, fallback to download
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

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  if (loading) {
    return (
      <div className="model-version-history">
        <div className="version-header">
          <h2>Model Version History</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        <div className="loading">Loading versions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="model-version-history">
        <div className="version-header">
          <h2>Model Version History</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        <div className="error">{error}</div>
      </div>
    )
  }

  return (
    <div className="model-version-history">
      <div className="version-header">
        <h2>Model Version History</h2>
        <div className="header-actions">
          <label className="upload-button">
            {uploading ? 'Uploading...' : 'Upload New Version'}
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".obj,.fbx,.gltf,.glb,.blend,.max,.ma,.mb"
              style={{ display: 'none' }}
            />
          </label>
          <button onClick={onClose} className="close-button">×</button>
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="empty-state">
          <p>No versions available</p>
          <p className="hint">Upload a new version to get started</p>
        </div>
      ) : (
        <div className="versions-list">
          {versions.map((version) => (
            <div
              key={version.id}
              className="version-card"
              onClick={() => onVersionSelect?.(version)}
            >
              <div className="version-info">
                <div className="version-number">Version {version.versionNumber}</div>
                <div className="version-date">{formatDate(version.createdAt)}</div>
                {version.description && (
                  <div className="version-description">{version.description}</div>
                )}
              </div>

              <div className="version-files">
                {version.files.map((file) => (
                  <div key={file.id} className="file-item">
                    <div className="file-info">
                      <span className="file-name">{file.originalFileName}</span>
                      <span className="file-type">{file.fileType}</span>
                      <span className="file-size">{formatFileSize(file.sizeBytes)}</span>
                    </div>
                    <div className="file-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownload(version, file)
                        }}
                        className="action-button"
                      >
                        Download
                      </button>
                      {file.fileType === 'blend' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenInBlender(version, file)
                          }}
                          className="action-button blender-button"
                        >
                          Open in Blender
                        </button>
                      )}
                      {file.isRenderable && (
                        <span className="renderable-badge">Renderable</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
