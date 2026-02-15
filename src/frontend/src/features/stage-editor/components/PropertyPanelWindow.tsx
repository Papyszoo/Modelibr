import { PropertyPanel } from './PropertyPanel'
import { FloatingWindow } from '@/components/FloatingWindow'
import { StageObject } from './SceneEditor'

interface PropertyPanelWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  selectedObject: StageObject | null
  onUpdateObject: (id: string, updates: Partial<StageObject>) => void
  onDeleteObject: (id: string) => void
}

export function PropertyPanelWindow({
  visible,
  onClose,
  side = 'right',
  selectedObject,
  onUpdateObject,
  onDeleteObject,
}: PropertyPanelWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Properties"
      side={side}
      windowId="stage-properties"
    >
      <PropertyPanel
        selectedObject={selectedObject}
        onUpdateObject={onUpdateObject}
        onDeleteObject={onDeleteObject}
      />
    </FloatingWindow>
  )
}

