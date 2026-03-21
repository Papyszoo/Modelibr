import { type Model } from '@/utils/fileUtils'

import { ModelInfo } from './ModelInfo'

interface ModelInfoSidebarProps {
  model: Model
  onModelUpdated?: () => void
}

export function ModelInfoSidebar({
  model,
  onModelUpdated,
}: ModelInfoSidebarProps): JSX.Element {
  return (
    <div data-testid="model-info-panel">
      <ModelInfo model={model} onModelUpdated={onModelUpdated} />
    </div>
  )
}
