import { Canvas } from '@react-three/fiber'
import FloatingWindow from '../../../components/FloatingWindow'
import { Model } from '../../../utils/fileUtils'
import UVMapScene from './UVMapScene'

interface UVMapWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  model: Model | null
}

function UVMapWindow({
  visible,
  onClose,
  side = 'left',
  model,
}: UVMapWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="UV Map / Vertex Position"
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
            Vertices colored by position: Red=X, Green=Y, Blue=Z
          </div>
          <Canvas
            shadows={false}
            style={{ width: '100%', height: 'calc(100% - 2rem)' }}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
            }}
            dpr={Math.min(window.devicePixelRatio, 2)}
          >
            <UVMapScene />
          </Canvas>
        </div>
      ) : (
        <p style={{ color: '#64748b', fontStyle: 'italic' }}>No model loaded</p>
      )}
    </FloatingWindow>
  )
}

export default UVMapWindow
