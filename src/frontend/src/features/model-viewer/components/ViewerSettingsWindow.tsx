import { ViewerSettings, ViewerSettingsType } from './ViewerSettings'
import { FloatingWindow } from '@/components/FloatingWindow'

interface ViewerSettingsWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  settings: ViewerSettingsType
  onSettingsChange: (settings: ViewerSettingsType) => void
}

export function ViewerSettingsWindow({
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

