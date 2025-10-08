import ModelInfo from './ModelInfo'
import { Model } from '../../../utils/fileUtils'

interface ModelInfoSidebarProps {
  model: Model
}

function ModelInfoSidebar({ model }: ModelInfoSidebarProps): JSX.Element {
  return (
    <div className="sidebar-section">
      <h2>Model Information</h2>
      <ModelInfo model={model} />
    </div>
  )
}

export default ModelInfoSidebar
