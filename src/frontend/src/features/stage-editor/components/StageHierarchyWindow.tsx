import FloatingWindow from '../../../components/FloatingWindow'
import StageHierarchy from './StageHierarchy'
import { StageConfig, StageGroup } from './SceneEditor'

interface StageHierarchyWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  stageConfig: StageConfig
  selectedObjectId: string | null
  onSelectObject: (id: string | null) => void
  onDeleteObject: (id: string) => void
  onUpdateGroup: (groupId: string, updates: Partial<StageGroup>) => void
}

function StageHierarchyWindow({
  visible,
  onClose,
  side = 'left',
  stageConfig,
  selectedObjectId,
  onSelectObject,
  onDeleteObject,
  onUpdateGroup,
}: StageHierarchyWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Stage Hierarchy"
      side={side}
      windowId="stage-hierarchy"
    >
      <StageHierarchy
        stageConfig={stageConfig}
        selectedObjectId={selectedObjectId}
        onSelectObject={onSelectObject}
        onDeleteObject={onDeleteObject}
        onUpdateGroup={onUpdateGroup}
      />
    </FloatingWindow>
  )
}

export default StageHierarchyWindow
