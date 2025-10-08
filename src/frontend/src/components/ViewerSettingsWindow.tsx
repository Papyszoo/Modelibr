import ViewerSettings, { ViewerSettingsType } from './ViewerSettings'
import FloatingWindow from './FloatingWindow'

interface ViewerSettingsWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  settings: ViewerSettingsType
  onSettingsChange: (settings: ViewerSettingsType) => void
}

function ViewerSettingsWindow({
  visible,
  onClose,
  side = 'left',
  settings,
  onSettingsChange,
}: ViewerSettingsWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Viewer Settings"
      side={side}
      windowId="settings"
    >
      <ViewerSettings settings={settings} onSettingsChange={onSettingsChange} />
    </FloatingWindow>
  )
}

export default ViewerSettingsWindow
