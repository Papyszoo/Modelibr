import { Button } from 'primereact/button'

interface ModelListHeaderProps {
  isTabContent: boolean
  onBackToUpload?: () => void
  onUpload?: () => void
  onRefresh?: () => void
  modelCount?: number
}

export default function ModelListHeader({
  isTabContent,
  onBackToUpload,
  onUpload,
  onRefresh,
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
          {onUpload && (
            <Button
              icon="pi pi-upload"
              className="p-button-text p-button-sm"
              onClick={onUpload}
              tooltip="Upload models"
              tooltipOptions={{ position: 'bottom' }}
              aria-label="Upload models"
            />
          )}
          {onRefresh && (
            <Button
              icon="pi pi-refresh"
              className="p-button-text p-button-sm"
              onClick={onRefresh}
              tooltip="Refresh models"
              tooltipOptions={{ position: 'bottom' }}
            />
          )}
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
        {onRefresh && (
          <Button
            icon="pi pi-refresh"
            label="Refresh"
            className="p-button-outlined"
            onClick={onRefresh}
            tooltip="Refresh models list"
            tooltipOptions={{ position: 'bottom' }}
          />
        )}
      </div>
      <h1>3D Model Library</h1>
      <p>
        Drag and drop 3D model files onto the table to upload, or select a model
        to view in 3D
      </p>
    </header>
  )
}
