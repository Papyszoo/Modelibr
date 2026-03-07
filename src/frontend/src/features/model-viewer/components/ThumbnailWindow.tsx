import { Button } from 'primereact/button'

import { FloatingWindow } from '@/components/FloatingWindow'
import { ThumbnailDisplay } from '@/shared/thumbnail'
import { type ModelVersionDto } from '@/types'

interface ThumbnailWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  modelId: string | null
  selectedVersion?: ModelVersionDto | null
  onRegenerate?: () => void
}

export function ThumbnailWindow({
  visible,
  onClose,
  side = 'left',
  modelId,
  selectedVersion,
  onRegenerate,
}: ThumbnailWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Thumbnail Details"
      side={side}
      windowId="thumbnail"
    >
      {modelId ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <ThumbnailDisplay
            modelId={modelId}
            versionId={selectedVersion?.id}
          />
          {onRegenerate && (
            <Button
              label="Regenerate Thumbnail"
              icon="pi pi-refresh"
              onClick={onRegenerate}
              className="p-button-sm"
              style={{ alignSelf: 'flex-start' }}
            />
          )}
        </div>
      ) : (
        <p style={{ color: '#64748b', fontStyle: 'italic' }}>No model loaded</p>
      )}
    </FloatingWindow>
  )
}
