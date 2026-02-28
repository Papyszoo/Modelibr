import { FloatingWindow } from '@/components/FloatingWindow'
import { useModelHierarchy } from '@/features/model-viewer/hooks/useModelHierarchy'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'

import { ModelHierarchy } from './ModelHierarchy'

interface ModelHierarchyWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
}

export function ModelHierarchyWindow({
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
