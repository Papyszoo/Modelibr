import { ThumbnailDisplay } from '../../thumbnail'
import FloatingWindow from '../../../components/FloatingWindow'
import { Model } from '../../../utils/fileUtils'
import { Button } from 'primereact/button'

interface ThumbnailWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  model: Model | null
  onRegenerate?: () => void
}

function ThumbnailWindow({
  visible,
  onClose,
  side = 'left',
  model,
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
      {model ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <ThumbnailDisplay modelId={model.id.toString()} />
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

export default ThumbnailWindow
