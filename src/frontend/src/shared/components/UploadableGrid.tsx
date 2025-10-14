import { useState, ReactNode } from 'react'
import './UploadableGrid.css'

interface UploadableGridProps {
  children: ReactNode
  onFilesDropped: (files: File[]) => void
  isUploading?: boolean
  uploadMessage?: string
  className?: string
}

export default function UploadableGrid({
  children,
  onFilesDropped,
  isUploading = false,
  uploadMessage = 'Drop files here to upload',
  className = '',
}: UploadableGridProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Check if we're actually leaving the container (not just entering a child)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      onFilesDropped(files)
    }
  }

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
