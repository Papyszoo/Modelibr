import './ThumbnailSidebar.css'

import { Button } from 'primereact/button'
import type { JSX } from 'react'

import { ThumbnailDisplay } from '@/shared/thumbnail'
import { type Model } from '@/utils/fileUtils'

interface ThumbnailSidebarProps {
  model: Model
  onRegenerate: () => void
}

export function ThumbnailSidebar({
  model,
  onRegenerate,
}: ThumbnailSidebarProps): JSX.Element {
  return (
    <div className="thumbnail-panel">
      <div className="thumbnail-panel-actions">
        <Button
          icon="pi pi-refresh"
          label="Regenerate"
          className="p-button-sm p-button-outlined"
          onClick={onRegenerate}
          tooltip="Regenerate Thumbnail"
        />
      </div>
      <div className="thumbnail-panel-display">
        <ThumbnailDisplay modelId={model.id} />
      </div>
    </div>
  )
}
