import { useState, useRef, useEffect } from 'react'
import { Button } from 'primereact/button'
import { Model } from '../../../utils/fileUtils'
import { ModelVersionDto, VersionFileDto } from '../../../types'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import './VersionStrip.css'

// Import file format icons
import fbxIcon from '../../../assets/icons/fbx.svg'
import objIcon from '../../../assets/icons/obj.svg'
import gltfIcon from '../../../assets/icons/gltf.svg'
import glbIcon from '../../../assets/icons/glb.svg'
import blendIcon from '../../../assets/icons/blend.png'
import stlIcon from '../../../assets/icons/stl.svg'
import daeIcon from '../../../assets/icons/dae.svg'
import defaultIcon from '../../../assets/icons/default.svg'

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
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const handleVersionClick = (version: ModelVersionDto) => {
    onVersionSelect(version)
    setDropdownOpen(false)
  }

  const getFileFormatIcon = (fileType: string): string => {
    const type = fileType.toLowerCase()
    switch (type) {
      case 'fbx':
        return fbxIcon
      case 'obj':
        return objIcon
      case 'gltf':
        return gltfIcon
      case 'glb':
        return glbIcon
      case 'blend':
        return blendIcon
      case 'stl':
        return stlIcon
      case 'dae':
        return daeIcon
      default:
        return defaultIcon
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const displayFiles = selectedVersion?.files || []

  if (versions.length === 0) {
    return (
      <div className="version-strip">
        <div className="version-strip-empty">
          <span>No versions available</span>
        </div>
      </div>
    )
  }

  const isActiveVersion =
    selectedVersion && model.activeVersionId === selectedVersion.id
  const isLatestVersion =
    selectedVersion && selectedVersion.id === versions[versions.length - 1]?.id

  return (
    <div className="version-strip">
      {/* Version Dropdown */}
      <div className="version-dropdown-container" ref={dropdownRef}>
        <button
          className="version-dropdown-trigger"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <div className="version-dropdown-info">
            <span className="version-dropdown-number">
              v{selectedVersion?.versionNumber || '?'}
            </span>
            <div className="version-dropdown-badges">
              {isActiveVersion && (
                <span className="version-badge active">Active</span>
              )}
              {isLatestVersion && (
                <span className="version-badge latest">Latest</span>
              )}
            </div>
          </div>
          <i
            className={`pi ${dropdownOpen ? 'pi-chevron-up' : 'pi-chevron-down'}`}
          />
        </button>

        {dropdownOpen && (
          <div className="version-dropdown-menu">
            {versions.map(version => (
              <div
                key={version.id}
                className={`version-dropdown-item ${selectedVersion?.id === version.id ? 'selected' : ''}`}
                onClick={() => handleVersionClick(version)}
              >
                <img
                  src={ApiClient.getVersionThumbnailUrl(version.id)}
                  alt={`v${version.versionNumber}`}
                  className="version-dropdown-thumb"
                  onError={e => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <div className="version-dropdown-item-info">
                  <span className="version-dropdown-item-number">
                    v{version.versionNumber}
                  </span>
                  <div className="version-dropdown-item-badges">
                    {model.activeVersionId === version.id && (
                      <span className="version-badge active">Active</span>
                    )}
                    {version.id === versions[versions.length - 1]?.id && (
                      <span className="version-badge latest">Latest</span>
                    )}
                  </div>
                  <span className="version-dropdown-item-files">
                    {version.files.length} file
                    {version.files.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {model.activeVersionId !== version.id && (
                  <Button
                    icon="pi pi-check-circle"
                    className="p-button-text p-button-sm version-set-active-btn"
                    onClick={e => {
                      e.stopPropagation()
                      onSetActiveVersion(version.id)
                    }}
                    tooltip="Set as Active"
                    tooltipOptions={{ position: 'bottom' }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="version-strip-divider" />

      {/* Files List - Horizontal Scrollable */}
      <div className="version-strip-files">
        <div className="file-list-scroll">
          {displayFiles.length === 0 ? (
            <div className="file-list-empty">No files</div>
          ) : (
            displayFiles.map(file => (
              <div
                key={file.id}
                className={`file-strip-card ${file.isRenderable ? 'renderable' : ''} ${file.id === defaultFileId ? 'selected' : ''}`}
                onClick={() => handleFileSelect(file)}
              >
                <img
                  src={getFileFormatIcon(file.fileType)}
                  alt={file.fileType}
                  className="file-strip-icon-img"
                />
                <div className="file-strip-info">
                  <span
                    className="file-strip-name"
                    title={file.originalFileName}
                  >
                    {file.originalFileName.length > 16
                      ? `${file.originalFileName.substring(0, 14)}...`
                      : file.originalFileName}
                  </span>
                  <div className="file-strip-meta">
                    <span className="file-strip-format">
                      {file.fileType.toUpperCase()}
                    </span>
                    <span className="file-strip-size">
                      {formatFileSize(file.sizeBytes)}
                    </span>
                  </div>
                </div>
                <Button
                  icon="pi pi-download"
                  className="p-button-text p-button-sm file-download-btn"
                  onClick={e => {
                    e.stopPropagation()
                    handleDownloadFile(file)
                  }}
                  tooltip="Download"
                  tooltipOptions={{ position: 'bottom' }}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default VersionStrip
