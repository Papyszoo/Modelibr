import { ProgressBar } from 'primereact/progressbar'

interface LoadingStateProps {
  visible: boolean
}

export function LoadingState({ visible }: LoadingStateProps) {
  if (!visible) return null

  return (
    <div className="loading">
      <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
      <p>Loading models...</p>
    </div>
  )
}
