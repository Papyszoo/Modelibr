import './ModelVersionWindow.css'

import { Button } from 'primereact/button'
import { useEffect, useMemo, useState } from 'react'

import { FloatingWindow } from '@/components/FloatingWindow'
import {
  getVersionFileUrl,
  setActiveVersion,
} from '@/features/model-viewer/api/modelVersionApi'
import {
  useModelByIdQuery,
  useModelVersionsQuery,
} from '@/features/model-viewer/api/queries'
import { type ModelVersionDto } from '@/types'
import { formatDate, formatFileSize } from '@/utils/fileUtils'

interface ModelVersionWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  modelId: string | null
  onVersionSelect?: (version: ModelVersionDto) => void
  onDefaultFileChange?: (fileId: number) => void
  onModelUpdate?: () => void
  onRecycleVersion?: (versionId: number) => void
}

export function ModelVersionWindow({
  visible,
  onClose,
  side = 'left',
  modelId,
  onVersionSelect,
  onDefaultFileChange,
  onModelUpdate,
  onRecycleVersion,
}: ModelVersionWindowProps) {
  const modelQuery = useModelByIdQuery({
    modelId: modelId ?? '',
    queryConfig: { enabled: !!modelId },
  })
  const model = modelQuery.data ?? null
  const [selectedVersion, setSelectedVersion] =
    useState<ModelVersionDto | null>(null)
  const [defaultFileId, setDefaultFileId] = useState<number | null>(null)
  const numericModelId = modelId ? parseInt(modelId) : null
  const versionsQuery = useModelVersionsQuery({
    modelId: numericModelId ?? 0,
    queryConfig: {
      enabled: visible && numericModelId !== null,
    },
  })
  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data])
  const loading = versionsQuery.isLoading || versionsQuery.isFetching

  // Load default file preference from localStorage
  useEffect(() => {
    if (modelId) {
      const stored = localStorage.getItem(`model-${modelId}-default-file`)
      if (stored) {
        setDefaultFileId(parseInt(stored))
      }
    }
  }, [modelId])

  useEffect(() => {
    if (!visible) return

    if (versions.length === 0) {
      setSelectedVersion(null)
      return
    }

    if (!selectedVersion) {
      const latestVersion = versions[versions.length - 1]
      setSelectedVersion(latestVersion)
      if (onVersionSelect) {
        onVersionSelect(latestVersion)
      }
      return
    }

    const updatedSelectedVersion = versions.find(
      v => v.id === selectedVersion.id
    )
    if (updatedSelectedVersion && updatedSelectedVersion !== selectedVersion) {
      setSelectedVersion(updatedSelectedVersion)
      if (onVersionSelect) {
        onVersionSelect(updatedSelectedVersion)
      }
      return
    }

    if (!updatedSelectedVersion) {
      const latestVersion = versions[versions.length - 1]
      setSelectedVersion(latestVersion)
      if (onVersionSelect) {
        onVersionSelect(latestVersion)
      }
    }
  }, [versions, selectedVersion, visible, onVersionSelect])

  const handleVersionSelect = (version: ModelVersionDto) => {
    setSelectedVersion(version)
    if (onVersionSelect) {
      onVersionSelect(version)
    }
  }

  const handleDownloadFile = async (fileId: number, fileName: string) => {
    if (!selectedVersion || !numericModelId) return
    const url = getVersionFileUrl(numericModelId, selectedVersion.id, fileId)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      link.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleOpenInBlender = (fileId: number, _fileName: string) => {
    if (!selectedVersion || !numericModelId) return
    const url = getVersionFileUrl(numericModelId, selectedVersion.id, fileId)
    // Try to open with blender:// protocol
    const blenderUrl = `blender://${url}`
    window.location.href = blenderUrl
  }

  const handleSetDefaultFile = (fileId: number) => {
    if (!modelId) return
    setDefaultFileId(fileId)
    localStorage.setItem(`model-${modelId}-default-file`, fileId.toString())
    if (onDefaultFileChange) {
      onDefaultFileChange(fileId)
    }
  }

  const handleSetActiveVersion = async (versionId: number) => {
    if (!numericModelId) return
    try {
      await setActiveVersion(numericModelId, versionId)
      await versionsQuery.refetch()
      // Notify parent to refresh model data so UI updates immediately
      if (onModelUpdate) {
        onModelUpdate()
      }
    } catch (error) {
      console.error('Failed to set active version:', error)
    }
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
        <p style={{ color: '#64748b', fontStyle: 'italic' }}>
          Loading versions...
        </p>
      ) : versions.length === 0 ? (
        <div
          style={{ color: '#64748b', fontStyle: 'italic', padding: '1rem 0' }}
        >
          No versions available. Upload files to create versions.
        </div>
      ) : (
        <div className="version-window-content">
          {/* Version List */}
          <div className="version-list">
            <h4>Select Version:</h4>
            {versions.map(version => (
              <div
                key={version.id}
                className={`version-item ${selectedVersion?.id === version.id ? 'selected' : ''}`}
                onClick={() => handleVersionSelect(version)}
              >
                <div className="version-header">
                  <span className="version-number">
                    Version {version.versionNumber}
                  </span>
                  <div className="version-badges">
                    {model?.activeVersionId === version.id && (
                      <span className="active-badge">Active</span>
                    )}
                    {version.id === versions[versions.length - 1]?.id && (
                      <span className="latest-badge">Latest</span>
                    )}
                  </div>
                </div>
                {version.description && (
                  <div className="version-description">
                    {version.description}
                  </div>
                )}
                <div className="version-date">
                  {formatDate(version.createdAt)}
                </div>
                <div className="version-item-actions">
                  {model?.activeVersionId !== version.id && (
                    <Button
                      label="Set as Active"
                      icon="pi pi-check-circle"
                      size="small"
                      severity="success"
                      outlined
                      className="set-active-button"
                      onClick={e => {
                        e.stopPropagation()
                        handleSetActiveVersion(version.id)
                      }}
                    />
                  )}
                  <Button
                    label="Recycle"
                    icon="pi pi-trash"
                    size="small"
                    severity="danger"
                    outlined
                    disabled={versions.length <= 1}
                    onClick={e => {
                      e.stopPropagation()
                      if (onRecycleVersion) {
                        onRecycleVersion(version.id)
                      }
                    }}
                    tooltip={
                      versions.length <= 1
                        ? 'Cannot delete the last version'
                        : undefined
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Selected Version Files */}
          {selectedVersion && (
            <div className="version-files-section">
              <h4>Files in Version {selectedVersion.versionNumber}:</h4>
              <div className="file-list">
                {selectedVersion.files.map(file => (
                  <div key={file.id} className="file-card">
                    <div className="file-info-section">
                      <div className="file-name">{file.originalFileName}</div>
                      <div className="file-meta">
                        <span className="file-type-badge">{file.fileType}</span>
                        <span className="file-size">
                          {formatFileSize(file.sizeBytes)}
                        </span>
                        {file.isRenderable && (
                          <span className="renderable-badge">Renderable</span>
                        )}
                        {file.isRenderable && file.id === defaultFileId && (
                          <span className="default-file-badge">
                            Default Preview
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="file-actions">
                      <Button
                        label="Download"
                        icon="pi pi-download"
                        size="small"
                        onClick={() =>
                          handleDownloadFile(file.id, file.originalFileName)
                        }
                      />
                      {file.fileType === 'blend' && (
                        <Button
                          label="Open in Blender"
                          icon="pi pi-external-link"
                          size="small"
                          severity="success"
                          onClick={() =>
                            handleOpenInBlender(file.id, file.originalFileName)
                          }
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
