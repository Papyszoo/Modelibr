import { FloatingWindow } from '@/components/FloatingWindow'
import { useViewerSettingsStore } from '@/stores/viewerSettingsStore'

import { ViewerSettings } from './ViewerSettings'

interface ViewerSettingsWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
}

export function ViewerSettingsWindow({
  visible,
  onClose,
  side = 'left',
}: ViewerSettingsWindowProps) {
  const settings = useViewerSettingsStore(s => s.settings)
  const setSettings = useViewerSettingsStore(s => s.setSettings)

  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Viewer Settings"
      side={side}
      windowId="settings"
    >
      <ViewerSettings settings={settings} onSettingsChange={setSettings} />
    </FloatingWindow>
  )
}
