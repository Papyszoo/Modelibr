import { FloatingWindow } from '@/components/FloatingWindow'
import { useModelByIdQuery } from '@/features/model-viewer/api/queries'

import { ModelInfo } from './ModelInfo'

interface ModelInfoWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  modelId: string | null
  onModelUpdated?: () => void
}

export function ModelInfoWindow({
  visible,
  onClose,
  side = 'left',
  modelId,
  onModelUpdated,
}: ModelInfoWindowProps) {
  const modelQuery = useModelByIdQuery({
    modelId: modelId ?? '',
    queryConfig: { enabled: !!modelId },
  })
  const model = modelQuery.data ?? null

  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Model Information"
      side={side}
      windowId="info"
    >
      {model ? (
        <ModelInfo model={model} onModelUpdated={onModelUpdated} />
      ) : (
        <p style={{ color: '#64748b', fontStyle: 'italic' }}>No model loaded</p>
      )}
    </FloatingWindow>
  )
}
