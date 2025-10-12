import { useEffect, useRef } from 'react'
import { ProgressBar } from 'primereact/progressbar'
import { Button } from 'primereact/button'
import { useUploadProgress } from '../../hooks/useUploadProgress'
import { useTabContext } from '../../hooks/useTabContext'
import FloatingWindow from '../../components/FloatingWindow'
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
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// Map file extensions to PrimeIcons
const getExtensionIcon = (extension: string): string => {
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
  return iconMap[extension] || 'pi-file'
}

// Map file type to icon
const getFileTypeIcon = (fileType: 'model' | 'texture' | 'file'): string => {
  const typeIconMap = {
    model: 'pi-box',
    texture: 'pi-image',
    file: 'pi-file',
  }
  return typeIconMap[fileType]
}

export default function UploadProgressWindow() {
  const { uploads, isVisible, hideWindow, removeUpload, clearCompleted } =
    useUploadProgress()
  const { openModelDetailsTab, openTab } = useTabContext()
  const windowRef = useRef<HTMLDivElement>(null)

  // Calculate overall progress
  const totalProgress = uploads.length > 0
    ? uploads.reduce((sum, upload) => sum + upload.progress, 0) / uploads.length
    : 0

  const activeUploads = uploads.filter(
    u => u.status === 'uploading' || u.status === 'pending'
  )
  const completedUploads = uploads.filter(u => u.status === 'completed')
  const failedUploads = uploads.filter(u => u.status === 'error')

  const handleOpenInTab = (upload: typeof uploads[0]) => {
    if (upload.status !== 'completed' || !upload.result) return

    try {
      // Handle opening based on file type and result
      if (upload.fileType === 'model' && upload.result) {
        const modelResult = upload.result as { id: number; name?: string }
        if (modelResult.id) {
          openModelDetailsTab({ id: modelResult.id.toString(), name: modelResult.name || upload.file.name })
        }
      } else if (upload.fileType === 'texture') {
        // For textures, we could open a texture viewer if available
        // For now, just show a message
        console.log('Texture uploaded:', upload.result)
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

  if (!isVisible || uploads.length === 0) return null

  return (
    <FloatingWindow
      visible={isVisible}
      onClose={hideWindow}
      title="File Uploads"
      side="left"
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
          {uploads.map(upload => {
            const extension = getFileExtension(upload.file.name)
            const extensionIcon = getExtensionIcon(extension)
            const typeIcon = getFileTypeIcon(upload.fileType)
            const fileSize = formatFileSize(upload.file.size)

            return (
              <div
                key={upload.id}
                className={`upload-item upload-item-${upload.status}`}
              >
                <div className="upload-item-icons">
                  <i className={`pi ${extensionIcon} upload-item-ext-icon`} />
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
                    <div className="upload-item-error">
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
                  {upload.status === 'completed' && upload.fileType === 'model' && (
                    <Button
                      icon="pi pi-external-link"
                      size="small"
                      text
                      rounded
                      title="Open in new tab"
                      onClick={() => handleOpenInTab(upload)}
                    />
                  )}
                  {(upload.status === 'completed' || upload.status === 'error') && (
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
          })}
        </div>
      </div>
    </FloatingWindow>
  )
}
