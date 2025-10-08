import ModelInfo from './ModelInfo'
import FloatingWindow from '../../../components/FloatingWindow'
import { Model } from '../../../utils/fileUtils'

interface ModelInfoWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  model: Model | null
}

function ModelInfoWindow({
  visible,
  onClose,
  side = 'left',
  model,
}: ModelInfoWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Model Information"
      side={side}
      windowId="info"
    >
      {model ? (
        <ModelInfo model={model} />
      ) : (
        <p style={{ color: '#64748b', fontStyle: 'italic' }}>No model loaded</p>
      )}
    </FloatingWindow>
  )
}

export default ModelInfoWindow
