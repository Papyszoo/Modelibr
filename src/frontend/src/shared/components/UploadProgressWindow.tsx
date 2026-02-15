import { useEffect, useRef } from 'react'
import { ProgressBar } from 'primereact/progressbar'
import { Button } from 'primereact/button'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { FloatingWindow } from '@/components/FloatingWindow'
import { openTabInPanel } from '@/utils/tabNavigation'
import './UploadProgressWindow.css'

// Utility function to get file extension
const getFileExtension = (fileName: string): string => {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

// Utility function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// Map file extensions to PrimeIcons with extension name display
const getExtensionIcon = (
  extension: string
): { icon: string; name: string } => {
  const iconMap: Record<string, string> = {
    // Images
    jpg: 'pi-image',
    jpeg: 'pi-image',
    png: 'pi-image',
    gif: 'pi-image',
    webp: 'pi-image',
    svg: 'pi-image',
    // 3D Models
    obj: 'pi-box',
    fbx: 'pi-box',
    gltf: 'pi-box',
    glb: 'pi-box',
    stl: 'pi-box',
    dae: 'pi-box',
    '3ds': 'pi-box',
    // Documents
    pdf: 'pi-file-pdf',
    doc: 'pi-file-word',
    docx: 'pi-file-word',
    xls: 'pi-file-excel',
    xlsx: 'pi-file-excel',
    // Archives
    zip: 'pi-folder',
    rar: 'pi-folder',
    '7z': 'pi-folder',
    // Default
  }
  return {
    icon: iconMap[extension] || 'pi-file',
    name: extension.toUpperCase(),
  }
}

// Map file type to icon
const getFileTypeIcon = (
  fileType: 'model' | 'texture' | 'file' | 'sprite'
): string => {
  const typeIconMap = {
    model: 'pi-box',
    texture: 'pi-image',
    file: 'pi-file',
    sprite: 'pi-image',
  }
  return typeIconMap[fileType]
}

export function UploadProgressWindow() {
  const {
    uploads,
    batches,
    isVisible,
    hideWindow,
    removeUpload,
    clearCompleted,
    toggleBatchCollapse,
  } = useUploadProgress()
  const windowRef = useRef<HTMLDivElement>(null)

  // Calculate overall progress
  const totalProgress =
    uploads.length > 0
      ? uploads.reduce((sum, upload) => sum + upload.progress, 0) /
        uploads.length
      : 0

  const activeUploads = uploads.filter(
    u => u.status === 'uploading' || u.status === 'pending'
  )
  const completedUploads = uploads.filter(u => u.status === 'completed')
  const failedUploads = uploads.filter(u => u.status === 'error')

  // Group uploads without batches separately
  const unbatchedUploads = uploads.filter(u => !u.batchId)

  const handleOpenInTab = (upload: (typeof uploads)[0]) => {
    if (upload.status !== 'completed' || !upload.result) return

    try {
      // Handle opening based on file type and result
      if (upload.fileType === 'model' && upload.result) {
        const modelResult = upload.result as { id: number; name?: string }
        if (modelResult.id) {
          openTabInPanel('modelViewer', 'left', modelResult.id.toString())
        }
      } else if (upload.fileType === 'texture') {
        // Check if result contains a texture set ID
        const textureResult = upload.result as {
          setId?: number
          textureSetId?: number
        }
        const setId = textureResult.setId || textureResult.textureSetId
        if (setId) {
          openTabInPanel('textureSetViewer', 'left', setId.toString())
        }
      }
    } catch (error) {
      console.error('Failed to open file in tab:', error)
    }
  }

  const handleClearCompleted = () => {
    clearCompleted()
    // If no uploads remain, hide the window
    if (uploads.length === completedUploads.length + failedUploads.length) {
      hideWindow()
    }
  }

  const handleRemoveBatch = (batchId: string) => {
    // Get all upload IDs in this batch
    const batch = batches.find(b => b.id === batchId)
    if (batch) {
      batch.files.forEach(upload => removeUpload(upload.id))
    }
  }

  // Auto-hide window when all uploads are done and some time has passed
  useEffect(() => {
    if (uploads.length > 0 && activeUploads.length === 0) {
      const timer = setTimeout(() => {
        // Don't auto-hide if there are errors
        if (failedUploads.length === 0) {
          // Auto-hide only if all are completed
          // hideWindow() // Commented out: keep window open as per requirements
        }
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [activeUploads.length, uploads.length, failedUploads.length])

  const renderUploadItem = (upload: (typeof uploads)[0]) => {
    const extension = getFileExtension(upload.file.name)
    const extensionInfo = getExtensionIcon(extension)
    const typeIcon = getFileTypeIcon(upload.fileType)
    const fileSize = formatFileSize(upload.file.size)
    const isInBatch = !!upload.batchId

    return (
      <div
        key={upload.id}
        className={`upload-item upload-item-${upload.status}`}
      >
        <div className="upload-item-icons">
          <div className="upload-item-ext-icon-container">
            <i className={`pi ${extensionInfo.icon} upload-item-ext-icon`} />
            <span className="upload-item-ext-name">{extensionInfo.name}</span>
          </div>
          <i className={`pi ${typeIcon} upload-item-type-icon`} />
        </div>

        <div className="upload-item-details">
          <div className="upload-item-header">
            <span className="upload-item-name" title={upload.file.name}>
              {upload.file.name}
            </span>
            <span className="upload-item-size">{fileSize}</span>
          </div>

          {upload.status === 'error' ? (
            <div className="upload-item-error-message">
              <i className="pi pi-exclamation-triangle" />
              <span>{upload.error?.message || 'Upload failed'}</span>
            </div>
          ) : (
            <ProgressBar
              value={upload.progress}
              className="upload-item-progress"
              showValue={false}
            />
          )}
        </div>

        <div className="upload-item-actions">
          {upload.status === 'completed' && upload.fileType !== 'sprite' && (
            <Button
              icon="pi pi-external-link"
              size="small"
              text
              rounded
              title="Open in new tab"
              onClick={() => handleOpenInTab(upload)}
            />
          )}
          {/* Only show remove button for files NOT in a batch */}
          {!isInBatch &&
            (upload.status === 'completed' || upload.status === 'error') && (
              <Button
                icon="pi pi-times"
                size="small"
                text
                rounded
                severity="secondary"
                title="Remove"
                onClick={() => removeUpload(upload.id)}
              />
            )}
        </div>
      </div>
    )
  }

  const renderBatch = (batch: (typeof batches)[0]) => {
    const batchProgress =
      batch.files.length > 0
        ? batch.files.reduce((sum, upload) => sum + upload.progress, 0) /
          batch.files.length
        : 0

    const batchActiveUploads = batch.files.filter(
      u => u.status === 'uploading' || u.status === 'pending'
    )
    const batchCompleted = batch.files.filter(u => u.status === 'completed')
    const batchFailed = batch.files.filter(u => u.status === 'error')
    const canRemoveBatch =
      batchActiveUploads.length === 0 &&
      (batchCompleted.length > 0 || batchFailed.length > 0)

    return (
      <div key={batch.id} className="upload-batch">
        <div className="upload-batch-header-wrapper">
          <div
            className="upload-batch-header"
            onClick={() => toggleBatchCollapse(batch.id)}
          >
            <div className="upload-batch-info">
              <i
                className={`pi ${batch.collapsed ? 'pi-chevron-right' : 'pi-chevron-down'} upload-batch-toggle`}
              />
              <span className="upload-batch-title">
                Batch Upload - {batch.files.length} file
                {batch.files.length > 1 ? 's' : ''}
              </span>
              <span className="upload-batch-status">
                {batchActiveUploads.length > 0
                  ? `Uploading ${batchActiveUploads.length}...`
                  : `${batchCompleted.length} completed${batchFailed.length > 0 ? `, ${batchFailed.length} failed` : ''}`}
              </span>
            </div>
            <ProgressBar
              value={Math.round(batchProgress)}
              className="upload-batch-progress"
              showValue={false}
            />
          </div>
          {canRemoveBatch && (
            <div className="upload-batch-actions">
              <Button
                icon="pi pi-times"
                size="small"
                text
                rounded
                severity="secondary"
                title="Remove batch"
                onClick={e => {
                  e.stopPropagation()
                  handleRemoveBatch(batch.id)
                }}
              />
            </div>
          )}
        </div>
        {!batch.collapsed && (
          <div className="upload-batch-items">
            {batch.files.map(upload => renderUploadItem(upload))}
          </div>
        )}
      </div>
    )
  }

  if (!isVisible || uploads.length === 0) return null

  return (
    <FloatingWindow
      visible={isVisible}
      onClose={hideWindow}
      title="File Uploads"
      side="none"
      windowId="upload-progress-window"
    >
      <div ref={windowRef} className="upload-progress-window">
        {/* Summary Section */}
        <div className="upload-summary">
          <div className="upload-summary-header">
            <span className="upload-summary-text">
              {activeUploads.length > 0
                ? `Uploading ${activeUploads.length} file${activeUploads.length > 1 ? 's' : ''}...`
                : `${completedUploads.length} completed${failedUploads.length > 0 ? `, ${failedUploads.length} failed` : ''}`}
            </span>
            {completedUploads.length > 0 && (
              <Button
                label="Clear Completed"
                icon="pi pi-trash"
                size="small"
                text
                onClick={handleClearCompleted}
              />
            )}
          </div>
          <ProgressBar
            value={Math.round(totalProgress)}
            className="upload-summary-progress"
          />
        </div>

        {/* Upload Items List */}
        <div className="upload-items-list">
          {/* Render batches */}
          {batches.map(batch => renderBatch(batch))}

          {/* Render unbatched uploads */}
          {unbatchedUploads.map(upload => renderUploadItem(upload))}
        </div>
      </div>
    </FloatingWindow>
  )
}
