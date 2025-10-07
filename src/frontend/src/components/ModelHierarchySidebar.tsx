import ModelHierarchy from './ModelHierarchy'
import { useModelObject } from '../hooks/useModelObject'
import { useModelHierarchy } from '../hooks/useModelHierarchy'

function ModelHierarchySidebar() {
  const { modelObject } = useModelObject()
  const hierarchy = useModelHierarchy(modelObject)

  return (
    <div className="sidebar-section">
      <h2>Model Hierarchy</h2>
      <ModelHierarchy hierarchy={hierarchy} />
    </div>
  )
}

export default ModelHierarchySidebar
