import { useState, useRef } from 'react'
import { Button } from 'primereact/button'
import { Tooltip } from 'primereact/tooltip'
import { Model, ModelVersionDto, VersionFileDto } from '../../../types'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import './VersionStrip.css'

interface VersionStripProps {
  model: Model
  versions: ModelVersionDto[]
  selectedVersion: ModelVersionDto | null
  onVersionSelect: (version: ModelVersionDto) => void
  onSetActiveVersion: (versionId: number) => void
  defaultFileId: number | null
  onDefaultFileChange: (fileId: number) => void
}

function VersionStrip({
  model,
  versions,
  selectedVersion,
  onVersionSelect,
  onSetActiveVersion,
  defaultFileId,
  onDefaultFileChange,
}: VersionStripProps) {
  const [hoveredVersionId, setHoveredVersionId] = useState<number | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleDownloadFile = (file: VersionFileDto) => {
    if (!selectedVersion || !model) return
    const url = ApiClient.getVersionFileUrl(
      parseInt(model.id),
      selectedVersion.id,
      file.id
    )
    window.open(url, '_blank')
  }

  const handleFileSelect = (file: VersionFileDto) => {
    if (file.isRenderable) {
      onDefaultFileChange(file.id)
    }
  }

  const getFileFormatIcon = (fileType: string): string => {
    const type = fileType.toLowerCase()
    switch (type) {
      case 'fbx':
        return 'pi-box'
      case 'obj':
        return 'pi-box'
      case 'gltf':
      case 'glb':
        return 'pi-globe'
      case 'blend':
        return 'pi-stop'
      case 'stl':
        return 'pi-th-large'
      case 'dae':
        return 'pi-sitemap'
      default:
        return 'pi-file'
    }
  }

  const thumbnailUrl = ApiClient.getThumbnailUrl(model.id)

  // Get the files to display - from selected version or from model's active version
  const displayFiles = selectedVersion?.files || []

  if (versions.length === 0) {
    return (
      <div className="version-strip">
        <div className="version-strip-empty">
          <span>No versions available. Upload files to create versions.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="version-strip">
      {/* Version List - Vertical Scrollable */}
      <div className="version-strip-versions">
        <div className="version-strip-label">Versions</div>
        <div className="version-list-scroll">
          {versions.map((version) => (
            <div
              key={version.id}
              className={`version-strip-item ${selectedVersion?.id === version.id ? 'selected' : ''}`}
              onClick={() => onVersionSelect(version)}
              onMouseEnter={() => setHoveredVersionId(version.id)}
              onMouseLeave={() => setHoveredVersionId(null)}
              data-pr-tooltip=""
              data-pr-position="bottom"
            >
              <div className="version-strip-item-content">
                <span className="version-strip-number">v{version.versionNumber}</span>
                <div className="version-strip-badges">
                  {model.activeVersionId === version.id && (
                    <span className="version-badge active">Active</span>
                  )}
                  {version.id === versions[versions.length - 1]?.id && (
                    <span className="version-badge latest">Latest</span>
                  )}
                </div>
              </div>
              {model.activeVersionId !== version.id && (
                <Button
                  icon="pi pi-check-circle"
                  className="p-button-text p-button-sm version-set-active-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetActiveVersion(version.id)
                  }}
                  tooltip="Set as Active"
                  tooltipOptions={{ position: 'bottom' }}
                />
              )}
              
              {/* Thumbnail tooltip on hover */}
              {hoveredVersionId === version.id && (
                <div className="version-thumbnail-tooltip" ref={tooltipRef}>
                  <img
                    src={thumbnailUrl}
                    alt={`Version ${version.versionNumber} preview`}
                    className="version-thumbnail-image"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                  <div className="version-thumbnail-info">
                    <span>Version {version.versionNumber}</span>
                    <span className="version-thumbnail-files">
                      {version.files.length} file{version.files.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="version-strip-divider" />

      {/* Files List - Horizontal Scrollable */}
      <div className="version-strip-files">
        <div className="version-strip-label">
          {selectedVersion 
            ? `Files in v${selectedVersion.versionNumber}` 
            : 'Select a version'}
        </div>
        <div className="file-list-scroll">
          {displayFiles.length === 0 ? (
            <div className="file-list-empty">No files in this version</div>
          ) : (
            displayFiles.map((file) => (
              <div
                key={file.id}
                className={`file-strip-card ${file.isRenderable ? 'renderable' : ''} ${file.id === defaultFileId ? 'selected' : ''}`}
                onClick={() => handleFileSelect(file)}
              >
                <div className="file-strip-icon">
                  <i className={`pi ${getFileFormatIcon(file.fileType)}`} />
                </div>
                <div className="file-strip-info">
                  <span className="file-strip-format">{file.fileType.toUpperCase()}</span>
                  <span className="file-strip-name" title={file.originalFileName}>
                    {file.originalFileName.length > 15 
                      ? `${file.originalFileName.substring(0, 12)}...`
                      : file.originalFileName}
                  </span>
                </div>
                <div className="file-strip-actions">
                  <Button
                    icon="pi pi-download"
                    className="p-button-text p-button-sm file-download-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDownloadFile(file)
                    }}
                    tooltip="Download"
                    tooltipOptions={{ position: 'bottom' }}
                  />
                  {file.isRenderable && file.id === defaultFileId && (
                    <i className="pi pi-star-fill file-selected-icon" title="Selected for preview" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default VersionStrip
