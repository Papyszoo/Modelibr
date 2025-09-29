import { Button } from 'primereact/button'

interface ModelListHeaderProps {
  isTabContent: boolean
  onBackToUpload?: () => void
  modelCount?: number
}

export default function ModelListHeader({
  isTabContent,
  onBackToUpload,
  modelCount = 0,
}: ModelListHeaderProps) {
  if (isTabContent) {
    return (
      <header className="model-list-header-tab">
        <h1>3D Model Library</h1>
        <div className="model-stats">
          <span className="stat-item">
            <i className="pi pi-box"></i>
            {modelCount} models
          </span>
        </div>
      </header>
    )
  }

  return (
    <header className="model-list-header">
      <div className="header-controls">
        <Button
          icon="pi pi-upload"
          label="Upload Page"
          className="p-button-outlined"
          onClick={onBackToUpload}
        />
      </div>
      <h1>3D Model Library</h1>
      <p>
        Drag and drop 3D model files onto the table to upload, or select a
        model to view in 3D
      </p>
    </header>
  )
}