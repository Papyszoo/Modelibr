import { Button } from 'primereact/button'
import { useRef } from 'react'

interface EnvironmentMapThumbnailPanelProps {
  thumbnailUrl: string | null
  environmentMapName: string
  isThumbnailUploading: boolean
  isRegenerating: boolean
  onUpload: (file: File | null) => void
  onRegenerate: () => void
}

export function EnvironmentMapThumbnailPanel({
  thumbnailUrl,
  environmentMapName,
  isThumbnailUploading,
  isRegenerating,
  onUpload,
  onRegenerate,
}: EnvironmentMapThumbnailPanelProps) {
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="environment-map-viewer-panel-body environment-map-thumbnail-panel">
      <div className="environment-map-thumbnail-card">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={environmentMapName} />
        ) : (
          <div className="environment-map-thumbnail-placeholder">
            <i className="pi pi-image" />
            <span>No thumbnail available</span>
          </div>
        )}
      </div>

      <div className="environment-map-thumbnail-actions">
        <input
          ref={thumbnailInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={event => {
            const file = event.target.files?.[0] ?? null
            onUpload(file)
            event.target.value = ''
          }}
        />
        <Button
          label="Upload"
          icon="pi pi-upload"
          className="p-button-outlined"
          onClick={() => thumbnailInputRef.current?.click()}
          disabled={isThumbnailUploading || isRegenerating}
        />
        <Button
          label="Generate"
          icon="pi pi-refresh"
          onClick={onRegenerate}
          loading={isRegenerating}
          disabled={isThumbnailUploading}
        />
      </div>
    </div>
  )
}
