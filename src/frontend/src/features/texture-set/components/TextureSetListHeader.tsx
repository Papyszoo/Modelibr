import { useRef } from 'react'
import { Button } from 'primereact/button'

interface TextureSetListHeaderProps {
  setCount: number
  onCreateSet: () => void
  onFilesSelected?: (files: FileList) => void
}

export default function TextureSetListHeader({
  setCount,
  onCreateSet,
  onFilesSelected,
}: TextureSetListHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onFilesSelected) {
      onFilesSelected(e.target.files)
    }
    // Reset the input so the same file can be selected again
    e.target.value = ''
  }

  return (
    <header className="texture-set-list-header">
      <div className="header-content">
        <h1>Texture Sets</h1>
        <div className="texture-set-stats">
          <span className="stat-item">
            <i className="pi pi-palette"></i>
            {setCount} set{setCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div className="header-actions">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          data-testid="texture-upload-input"
        />
        <Button
          label="Upload Textures"
          icon="pi pi-upload"
          onClick={handleUploadClick}
          className="p-button-secondary"
          aria-label="Upload textures"
        />
        <Button
          label="Create Set"
          icon="pi pi-plus"
          onClick={onCreateSet}
          className="p-button-primary"
        />
      </div>
    </header>
  )
}
