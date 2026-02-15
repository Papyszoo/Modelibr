import { useState, useCallback, useRef, ReactNode } from 'react'
import './UploadableGrid.css'

interface UploadableGridProps {
  children: ReactNode
  onFilesDropped: (files: File[]) => void
  isUploading?: boolean
  uploadMessage?: string
  className?: string
}

export function UploadableGrid({
  children,
  onFilesDropped,
  isUploading = false,
  uploadMessage = 'Drop files here to upload',
  className = '',
}: UploadableGridProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        onFilesDropped(files)
      }
    },
    [onFilesDropped]
  )

  return (
    <div
      className={`uploadable-grid-container ${className} ${
        isDragging ? 'dragging' : ''
      } ${isUploading ? 'uploading' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div className="uploadable-grid-overlay">
          <div className="uploadable-grid-overlay-content">
            <i className="pi pi-cloud-upload" />
            <p>{uploadMessage}</p>
          </div>
        </div>
      )}
      {isUploading && (
        <div className="uploadable-grid-loading">
          <i className="pi pi-spin pi-spinner" />
          <p>Uploading...</p>
        </div>
      )}
    </div>
  )
}
