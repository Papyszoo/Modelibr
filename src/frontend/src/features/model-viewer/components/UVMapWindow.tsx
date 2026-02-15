import { FloatingWindow } from '@/components/FloatingWindow'
import { Model } from '@/utils/fileUtils'
import { UVMapScene } from './UVMapScene'

interface UVMapWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  model: Model | null
}

export function UVMapWindow({
  visible,
  onClose,
  side = 'left',
  model,
}: UVMapWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="UV Map"
      side={side}
      windowId="uvmap"
    >
      {model ? (
        <div style={{ width: '100%', height: '400px' }}>
          <div
            style={{
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              color: '#64748b',
            }}
          >
            2D UV layout with faces colored by 3D position (R=X, G=Y, B=Z)
          </div>
          <div style={{ width: '100%', height: 'calc(100% - 2rem)' }}>
            <UVMapScene width={500} height={400} />
          </div>
        </div>
      ) : (
        <p style={{ color: '#64748b', fontStyle: 'italic' }}>No model loaded</p>
      )}
    </FloatingWindow>
  )
}

