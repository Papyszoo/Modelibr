import { Button } from 'primereact/button'
import { ThumbnailDisplay } from '@/shared/thumbnail'
import { Model } from '@/utils/fileUtils'

interface ThumbnailSidebarProps {
  model: Model
  onRegenerate: () => void
}

export function ThumbnailSidebar({
  model,
  onRegenerate,
}: ThumbnailSidebarProps): JSX.Element {
  return (
    <div className="sidebar-section">
      <h2>Thumbnail Details</h2>
      <div className="thumbnail-section">
        <div className="thumbnail-header">
          <h3>Animated Thumbnail</h3>
          <Button
            icon="pi pi-refresh"
            label="Regenerate"
            className="p-button-sm p-button-outlined"
            onClick={onRegenerate}
            tooltip="Regenerate Thumbnail"
          />
        </div>
        <ThumbnailDisplay modelId={model.id} />
      </div>
    </div>
  )
}
