import ComponentLibrary, { ComponentType } from './ComponentLibrary'
import FloatingWindow from '@/components/FloatingWindow'

interface ComponentLibraryWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  onAddComponent: (category: ComponentType, type: string) => void
}

function ComponentLibraryWindow({
  visible,
  onClose,
  side = 'left',
  onAddComponent,
}: ComponentLibraryWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Components Library"
      side={side}
      windowId="stage-components"
    >
      <ComponentLibrary onAddComponent={onAddComponent} />
    </FloatingWindow>
  )
}

export default ComponentLibraryWindow
