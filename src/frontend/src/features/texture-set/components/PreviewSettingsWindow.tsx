import PreviewSettings, { PreviewSettingsType } from './PreviewSettings'
import FloatingWindow from '../../../components/FloatingWindow'

interface PreviewSettingsWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right'
  settings: PreviewSettingsType
  onSettingsChange: (settings: PreviewSettingsType) => void
}

function PreviewSettingsWindow({
  visible,
  onClose,
  side = 'left',
  settings,
  onSettingsChange,
}: PreviewSettingsWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Preview Settings"
      side={side}
      windowId="preview-settings"
    >
      <PreviewSettings
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    </FloatingWindow>
  )
}

export default PreviewSettingsWindow
