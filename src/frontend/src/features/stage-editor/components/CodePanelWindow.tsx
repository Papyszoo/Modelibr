import { CodePanel } from './CodePanel'
import { FloatingWindow } from '@/components/FloatingWindow'
import { StageConfig } from './SceneEditor'

interface CodePanelWindowProps {
  visible: boolean
  onClose: () => void
  side?: 'left' | 'right' | 'none'
  stageConfig: StageConfig
}

export function CodePanelWindow({
  visible,
  onClose,
  side = 'none',
  stageConfig,
}: CodePanelWindowProps) {
  return (
    <FloatingWindow
      visible={visible}
      onClose={onClose}
      title="Generated Code"
      side={side}
      windowId="stage-code"
    >
      <CodePanel stageConfig={stageConfig} />
    </FloatingWindow>
  )
}

