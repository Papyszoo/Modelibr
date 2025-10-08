import { useModelObject } from '../hooks/useModelObject'
import { useModelHierarchy } from '../hooks/useModelHierarchy'
import ModelHierarchy from './ModelHierarchy'
import FloatingWindow from '../../../components/FloatingWindow'

interface ModelHierarchyWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
}

function ModelHierarchyWindow({
  visible,
  onClose,
  side = 'left',
}: ModelHierarchyWindowProps) {
  const { modelObject } = useModelObject()
  const hierarchy = useModelHierarchy(modelObject)

  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Model Hierarchy"
      side={side}
      windowId="hierarchy"
    >
      <ModelHierarchy hierarchy={hierarchy} />
    </FloatingWindow>
  )
}

export default ModelHierarchyWindow
